import { type BuildResourceStats, ChaoticEvent, MoleculerCurrentQueueObject } from '@chaotic-next/shared-lib';
import { type Context, Service, type ServiceBroker } from 'moleculer';
import { Subject } from 'rxjs';
import { GitlabService } from '../gitlab/gitlab.service';
import { GitlabStatusEvent } from '../gitlab/interfaces';
import { RepoManagerService } from '../repo-manager/repo-manager.service';
import { BuildClassSyncService } from './build-class-sync.service';
import {
  BuilderDbConnections,
  BuildStatus,
  DatabasePackageAddedEvent,
  MoleculerBuildObject,
  QueuePromotedEvent,
} from '../types/types';
import { errorMessage } from '../utils/functions';
import {
  Build,
  BuildResourceUsage,
  getOrCreateBuilder,
  getOrCreatePackage,
  getOrCreateRepo,
  Package,
} from './builder.entity';
import { moleculerConfigCommonService } from './moleculer.config';
import { isFailingStatus } from './unresolved-failures';

export interface BuilderDatabaseServiceOptions {
  broker: ServiceBroker;
  dbConnections: BuilderDbConnections;
  repoManagerService: RepoManagerService;
  sseSubject: Subject<Partial<MessageEvent<ChaoticEvent>>>;
  gitlabService: GitlabService;
  buildClassSync: Pick<BuildClassSyncService, 'syncFromDeployment'>;
}

const BUILD_OUTCOME_EVENTS = new Set(['builds.success', 'builds.failed', 'builds.cancelled', 'builds.canceling']);

export const PENDING_DEPLOYMENT_TIMEOUT_MINUTES = 5;
export const PENDING_DEPLOYMENT_TIMEOUT_MS = PENDING_DEPLOYMENT_TIMEOUT_MINUTES * 60 * 1000;

interface PendingDeploymentCheck {
  build: Partial<Build>;
  pkgname: string;
  queuedAt: number;
  targetRepo: string;
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function resourceUsageFromStats(stats: BuildResourceStats): BuildResourceUsage | undefined {
  const sampleCount = finiteOrNull(stats.sample_count);
  if (sampleCount === null) return undefined;
  const usage = new BuildResourceUsage();
  usage.avgMemoryBytes = finiteOrNull(stats.avg_memory_bytes);
  usage.cpuTimeNs = finiteOrNull(stats.cpu_time_ns);
  usage.diskReadBytes = finiteOrNull(stats.disk_read_bytes);
  usage.diskWriteBytes = finiteOrNull(stats.disk_write_bytes);
  usage.durationMs = finiteOrNull(stats.duration_ms);
  usage.networkRxBytes = finiteOrNull(stats.network_rx_bytes);
  usage.networkTxBytes = finiteOrNull(stats.network_tx_bytes);
  usage.peakMemoryBytes = finiteOrNull(stats.peak_memory_bytes);
  usage.peakPids = finiteOrNull(stats.peak_pids);
  usage.sampleCount = sampleCount;
  return usage;
}

/**
 * Moleculer service writing build events (received over the broker) to the
 * database and pushing the corresponding SSE events. Created and registered by
 * BuilderService.initBroker().
 */
export class BuilderDatabaseService extends Service {
  private dbConnections: BuilderDbConnections;
  private repoManagerService: RepoManagerService;

  private readonly sseSubject$: Subject<Partial<MessageEvent<ChaoticEvent>>>;
  private readonly gitlabService: GitlabService;
  private readonly buildClassSync: Pick<BuildClassSyncService, 'syncFromDeployment'>;

  /**
   * Builds that succeeded while the repository databases did not yet carry
   * their packages; drained once database.packageAdded signals the deployment.
   */
  private pendingDeploymentChecks: PendingDeploymentCheck[] = [];
  private bumpChain: Promise<void> = Promise.resolve();

  private busyUpdating = false;
  private scheduledUpdate = false;

  constructor({
    broker,
    dbConnections,
    repoManagerService,
    sseSubject,
    gitlabService,
    buildClassSync,
  }: BuilderDatabaseServiceOptions) {
    super(broker);

    this.sseSubject$ = sseSubject;
    this.gitlabService = gitlabService;
    this.buildClassSync = buildClassSync;

    this.parseServiceSchema({
      name: 'builderDatabaseService',
      events: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        'builds.*'(ctx: Context<MoleculerBuildObject>) {
          this.logBuild(ctx);
        },
        // eslint-disable-next-line @typescript-eslint/naming-convention
        'gitlab.status'(ctx: Context<GitlabStatusEvent>) {
          void this.gitlabService.handleExternalStatus(ctx.params).catch((err: unknown) => {
            this.logger.error(`Failed to handle gitlab.status event: ${errorMessage(err)}`);
          });
        },
        // eslint-disable-next-line @typescript-eslint/naming-convention
        'database.removalCompleted'(ctx: Context<string[]>) {
          this.removeEntries(ctx);
        },
        // eslint-disable-next-line @typescript-eslint/naming-convention
        'database.packageAdded'(ctx: Context<DatabasePackageAddedEvent>) {
          void this.runDeferredDeploymentChecks(ctx.params).catch((err: unknown) => {
            this.logger.error(`Failed to handle database.packageAdded event: ${errorMessage(err)}`);
          });
        },
        // eslint-disable-next-line @typescript-eslint/naming-convention
        'metrics.currentQueue'(ctx: Context<MoleculerCurrentQueueObject>) {
          this.sseSubject$.next({
            data: {
              type: 'queue',
              ...ctx.params,
            },
          });
        },
        // eslint-disable-next-line @typescript-eslint/naming-convention
        'queue.promoted'(ctx: Context<QueuePromotedEvent>) {
          this.sseSubject$.next({
            data: {
              type: 'queue_promoted',
              ...ctx.params,
            },
          });
        },
      },
      ...moleculerConfigCommonService,
    });

    this.repoManagerService = repoManagerService;
    this.dbConnections = dbConnections;

    this.logger.info('BuilderDatabaseService created');
  }

  async logBuild(ctx: Context<MoleculerBuildObject>): Promise<void> {
    if (ctx.eventName && !BUILD_OUTCOME_EVENTS.has(ctx.eventName)) {
      return;
    }

    const params = ctx.params;

    if (
      !params.builder_name ||
      !params.target_repo ||
      !params.pkgname ||
      params.duration === undefined ||
      params.status === undefined
    ) {
      this.logger.warn(`Malformed build event '${ctx.eventName}': missing required fields, dropping entry`);
      return;
    }

    const [builder, repo] = await Promise.all([
      getOrCreateBuilder(params.builder_name, this.dbConnections.builder),
      getOrCreateRepo(params.target_repo, this.dbConnections.repo),
    ]);
    const pkg: Package = await getOrCreatePackage(params.pkgname, this.dbConnections.package, repo);

    pkg.lastUpdated = new Date().toISOString();

    const build: Partial<Build> = {
      arch: params.arch,
      buildClass: params.build_class ? params.build_class.toString() : undefined,
      builder,
      logUrl: params.logUrl,
      timeToEnd: params.duration,
      commit: params.commit?.split(':')[0],
      pkgbase: pkg,
      repo,
      status: params.status,
      replaced: params.replaced,
    };

    if (params.resourceStats) {
      build.resourceStats = resourceUsageFromStats(params.resourceStats);
    }

    // A finished build does not imply the repository databases already carry
    // its packages, so database-dependent work waits for database.packageAdded.
    if (params.status === BuildStatus.SUCCESS) {
      this.pendingDeploymentChecks.push({
        build,
        pkgname: params.pkgname,
        queuedAt: Date.now(),
        targetRepo: params.target_repo,
      });
    }

    try {
      this.logger.debug(await this.dbConnections.build.save(build));

      if (isFailingStatus(params.status)) {
        await this.dbConnections.silencedFailure.delete({ pkgname: params.pkgname });
      }

      this.sseSubject$.next({
        data: {
          type: 'build',
          package: pkg.pkgname,
          version: pkg.version,
          pkgrel: pkg.pkgrel,
          bump: pkg.bump ?? 0,
          duration: params.duration,
          repo: repo.name,
          status: params.status,
        },
      });
    } catch (err: unknown) {
      this.logger.error(err);
    }
  }

  /**
   * Runs the work deferred by successful builds: the repository databases now
   * carry the newly deployed packages, so rebuild triggers can be checked and
   * the cached Chaotic versions refreshed. Bump checks run one after another,
   * because concurrent checks would skip each other in RepoManager.
   */
  async runDeferredDeploymentChecks(event: DatabasePackageAddedEvent): Promise<void> {
    const deployedBuilds = this.takeDeployedBuilds(event);

    for (const build of deployedBuilds) {
      this.bumpChain = this.bumpChain.then(() => this.runBumpCheck(build));
    }

    if (this.busyUpdating) {
      this.logger.warn('Scheduling Chaotic version update, another update is in progress');
      this.scheduledUpdate = true;
    } else {
      await this.refreshChaoticVersions();
    }

    if (deployedBuilds.length > 0) {
      const deployedPkgbases = [
        ...new Set([event.pkgbase, ...deployedBuilds.map((build) => build.pkgbase?.pkgname ?? '')]),
      ];
      await this.buildClassSync.syncFromDeployment(event.target_repo, deployedPkgbases);
    }
  }

  private takeDeployedBuilds(event: DatabasePackageAddedEvent): Partial<Build>[] {
    const deployedPkgnames = new Set([event.pkgbase, ...event.packages]);
    const remaining: PendingDeploymentCheck[] = [];
    const taken: Partial<Build>[] = [];
    const now = Date.now();

    for (const pending of this.pendingDeploymentChecks) {
      if (now - pending.queuedAt >= PENDING_DEPLOYMENT_TIMEOUT_MS) {
        this.logger.warn(
          `No deployment announcement for ${pending.pkgname} within ${PENDING_DEPLOYMENT_TIMEOUT_MINUTES} minutes, dropping the deferred check`,
        );
        continue;
      }
      if (pending.targetRepo === event.target_repo && deployedPkgnames.has(pending.pkgname)) {
        taken.push(pending.build);
      } else {
        remaining.push(pending);
      }
    }

    this.pendingDeploymentChecks = remaining;
    return taken;
  }

  private async runBumpCheck(build: Partial<Build>): Promise<void> {
    try {
      await this.repoManagerService.eventuallyBumpAffected(build);
    } catch (err: unknown) {
      this.logger.error(`Deferred bump check failed for ${build.pkgbase?.pkgname}: ${errorMessage(err)}`);
    }
  }

  private async refreshChaoticVersions(): Promise<void> {
    this.busyUpdating = true;
    try {
      await this.repoManagerService.updateChaoticVersions();
      if (!this.scheduledUpdate) {
        return;
      }
      this.scheduledUpdate = false;
      await this.repoManagerService.updateChaoticVersions();
    } finally {
      this.busyUpdating = false;
    }
  }

  async removeEntries(ctx: Context<string[]>): Promise<void> {
    const pkgbases = ctx.params as string[];

    try {
      for (const pkgbase of pkgbases) {
        const pkg = await this.dbConnections.package.findOne({ where: { pkgname: pkgbase } });
        if (pkg) {
          await this.dbConnections.package.update(pkg.id, {
            isActive: false,
            lastUpdated: new Date().toISOString(),
          });
        }
        this.logger.info(`Removed ${pkgbase} from the database active records`);
      }
    } catch (err: unknown) {
      this.logger.error(err);
    }
  }
}
