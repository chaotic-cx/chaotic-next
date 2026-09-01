import { type BuildResourceStats, ChaoticEvent, MoleculerCurrentQueueObject } from '@chaotic-next/shared-lib';
import { type Context, Service, type ServiceBroker } from 'moleculer';
import { PinoLogger } from 'nestjs-pino';
import { Subject } from 'rxjs';
import { GitlabPipelineService } from '../gitlab/gitlab-pipeline.service';
import { GitlabStatusEvent } from '../gitlab/interfaces';
import { RepoManagerService } from '../repo-manager/repo-manager.service';
import {
  BuilderDbConnections,
  BuildStatus,
  DatabaseSuccessEvent,
  MoleculerBuildObject,
  QueuePromotedEvent,
} from '../types/types';
import { errorMessage } from '../utils/functions';
import { BuildClassSyncService } from './build-class-sync.service';
import { BuildFailureNotifierService } from './build-failure-notifier.service';
import { Build, BuildResourceUsage, Package } from './builder.entity';
import { EntityLookupService } from './entity-lookup.service';
import { moleculerConfigCommonService } from './moleculer.config';
import { isFailingStatus } from './unresolved-failures';

export interface BuilderDatabaseServiceOptions {
  broker: ServiceBroker;
  dbConnections: BuilderDbConnections;
  lookup: EntityLookupService;
  repoManagerService: RepoManagerService;
  sseSubject: Subject<Partial<MessageEvent<ChaoticEvent>>>;
  gitlabPipelineService: GitlabPipelineService;
  buildClassSync: Pick<BuildClassSyncService, 'syncFromDeployment'>;
  buildFailureNotifier?: Pick<BuildFailureNotifierService, 'handleFailedBuild'>;
  logger: PinoLogger;
}

const BUILD_OUTCOME_EVENTS = new Set([
  'builds.success',
  'builds.failed',
  'builds.alreadyBuilt',
  'builds.skipped',
  'builds.timeout',
  'builds.replaced',
  'builds.canceled',
  'builds.canceled-requeue',
  'builds.softwareFailure',
]);

export const PENDING_DEPLOYMENT_TIMEOUT_MINUTES = 5;
export const PENDING_DEPLOYMENT_TIMEOUT_MS = PENDING_DEPLOYMENT_TIMEOUT_MINUTES * 60 * 1000;

interface PendingDeploymentCheck {
  build: Partial<Build>;
  pkgbase: string;
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
  private lookup: EntityLookupService;

  private readonly sseSubject$: Subject<Partial<MessageEvent<ChaoticEvent>>>;
  private readonly gitlabPipelineService: GitlabPipelineService;
  private readonly buildClassSync: Pick<BuildClassSyncService, 'syncFromDeployment'>;
  private readonly buildFailureNotifier?: Pick<BuildFailureNotifierService, 'handleFailedBuild'>;
  private readonly pino: PinoLogger;

  /**
   * Builds that succeeded while the repository databases did not yet carry
   * their packages; drained once database.success signals the deployment.
   */
  private pendingDeploymentChecks: PendingDeploymentCheck[] = [];
  private bumpChain: Promise<void> = Promise.resolve();

  private busyUpdating = false;
  private scheduledUpdate = false;

  constructor({
    broker,
    dbConnections,
    lookup,
    repoManagerService,
    sseSubject,
    gitlabPipelineService,
    buildClassSync,
    buildFailureNotifier,
    logger,
  }: BuilderDatabaseServiceOptions) {
    super(broker);

    this.lookup = lookup;
    this.sseSubject$ = sseSubject;
    this.gitlabPipelineService = gitlabPipelineService;
    this.buildClassSync = buildClassSync;
    this.buildFailureNotifier = buildFailureNotifier;
    this.pino = logger;

    this.parseServiceSchema({
      name: 'builderDatabaseService',
      events: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        'builds.*'(ctx: Context<MoleculerBuildObject>) {
          this.pino.debug({ event: ctx.eventName, ...ctx.params }, 'Received build event');
          this.logBuild(ctx);
        },
        // eslint-disable-next-line @typescript-eslint/naming-convention
        'gitlab.status'(ctx: Context<GitlabStatusEvent>) {
          this.pino.debug({ event: ctx.eventName }, 'Received gitlab.status event');
          void this.gitlabPipelineService.handleExternalStatus(ctx.params).catch((err: unknown) => {
            this.pino.error(`Failed to handle gitlab.status event: ${errorMessage(err)}`);
          });
        },
        // eslint-disable-next-line @typescript-eslint/naming-convention
        'database.removalComplete'(ctx: Context<string[]>) {
          this.pino.debug({ event: ctx.eventName, pkgbaseCount: ctx.params.length }, 'Received removalComplete event');
          // Upstream broadcasts its keep list here, not the removed packages.
          void this.requestChaoticVersionsUpdate().catch((err: unknown) => {
            this.pino.error(`Failed to handle database.removalComplete event: ${errorMessage(err)}`);
          });
        },
        // eslint-disable-next-line @typescript-eslint/naming-convention
        'database.success'(ctx: Context<DatabaseSuccessEvent>) {
          this.pino.debug(
            {
              event: ctx.eventName,
              arch: ctx.params.arch,
              pkgname: ctx.params.pkgname,
              target_repo: ctx.params.target_repo,
            },
            'Received database.success event',
          );
          void this.runDeferredDeploymentChecks(ctx.params).catch((err: unknown) => {
            this.pino.error(`Failed to handle database.success event: ${errorMessage(err)}`);
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

    this.pino.debug('BuilderDatabaseService created');
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
      this.pino.warn(`Malformed build event '${ctx.eventName}': missing required fields, dropping entry`);
      return;
    }

    const [builder, repo] = await Promise.all([
      this.lookup.getOrCreateBuilder(params.builder_name),
      this.lookup.getOrCreateRepo(params.target_repo),
    ]);
    const pkg: Package = await this.lookup.getOrCreatePackage(params.pkgname, repo);

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

    if (params.status === BuildStatus.SUCCESS) {
      const pkgbase = pkg.pkgbaseName ?? pkg.pkgname;
      this.pino.debug({ pkgbase, target_repo: params.target_repo }, 'Syncing build classes for successful build');
      void this.buildClassSync.syncFromDeployment(repo.name, [pkgbase]).catch((err: unknown) => {
        this.pino.error(`Build class sync failed for ${pkgbase}: ${errorMessage(err)}`);
      });
    }

    // A finished build does not imply the repository databases already carry
    // its packages, so update-triggering work waits for database.success.
    if (params.status === BuildStatus.SUCCESS) {
      this.pino.debug(
        {
          pkgname: params.pkgname,
          target_repo: params.target_repo,
          pendingChecks: this.pendingDeploymentChecks.length + 1,
        },
        'Queued build for deployment checks',
      );
      this.pendingDeploymentChecks.push({
        build,
        pkgbase: pkg.pkgbaseName ?? pkg.pkgname,
        pkgname: params.pkgname,
        queuedAt: Date.now(),
        targetRepo: params.target_repo,
      });
    }

    try {
      this.pino.debug(await this.dbConnections.build.save(build));

      if (isFailingStatus(params.status)) {
        await this.dbConnections.silencedFailure.delete({ pkgname: params.pkgname });
        this.scanBuildFailureAndNotify(params);
      }

      this.sseSubject$.next({
        data: {
          type: 'build',
          package: pkg.pkgname,
          version: pkg.version ?? 'unknown',
          pkgrel: pkg.pkgrel ?? 0,
          bump: pkg.bump ?? 0,
          duration: params.duration,
          repo: repo.name,
          status: params.status,
        },
      });
    } catch (err: unknown) {
      this.pino.error(err);
    }
  }

  private scanBuildFailureAndNotify(params: MoleculerBuildObject): void {
    if (!this.buildFailureNotifier) return;
    void this.buildFailureNotifier.handleFailedBuild(params).catch((err: unknown) => {
      this.pino.error(`Failed to scan build failure for ${params.pkgname}: ${errorMessage(err)}`);
    });
  }

  /**
   * Runs the work deferred by successful builds: the repository databases now
   * carry the newly deployed packages, so rebuild triggers can be checked and
   * the cached Chaotic versions refreshed. Bump checks run one after another,
   * because concurrent checks would skip each other in RepoManager.
   */
  async runDeferredDeploymentChecks(event: DatabaseSuccessEvent): Promise<void> {
    const deployedBuilds = this.takeDeployedBuilds(event);
    this.pino.debug(
      {
        deployedBuilds: deployedBuilds.length,
        pendingChecks: this.pendingDeploymentChecks.length,
        pkgbase: event.pkgname,
      },
      'Running deferred deployment checks',
    );

    for (const build of deployedBuilds) {
      this.bumpChain = this.bumpChain.then(() => this.runBumpCheck(build));
    }

    await this.requestChaoticVersionsUpdate();

    // Re-emit build events with the now-correct version/pkgrel after the
    // DB poll — the initial `builds.success` emission used a stale/NULL
    // package row (race between build finish and repo DB pull). Frontend
    // suppresses the `unknown` stub, so this is the real deployment toast.
    for (const build of deployedBuilds) {
      const pkgname = build.pkgbase?.pkgname;
      const repo = build.repo;
      if (!pkgname || !repo) continue;
      try {
        const pkg = await this.lookup.getOrCreatePackage(pkgname, repo);
        if (!pkg.version || pkg.pkgrel == null) continue;
        const duration = typeof build.timeToEnd === 'number' ? build.timeToEnd : 0;
        this.sseSubject$.next({
          data: {
            type: 'build',
            package: pkg.pkgname,
            version: pkg.version,
            pkgrel: pkg.pkgrel,
            bump: pkg.bump ?? 0,
            duration,
            repo: repo.name,
            status: build.status ?? BuildStatus.SUCCESS,
          },
        });
      } catch (err: unknown) {
        this.pino.error(`Failed to re-emit deployed build event for ${pkgname}: ${errorMessage(err)}`);
      }
    }
  }

  async requestChaoticVersionsUpdate(): Promise<void> {
    if (this.busyUpdating) {
      this.pino.warn('Scheduling Chaotic version update, another update is in progress');
      this.scheduledUpdate = true;
      return;
    }
    await this.refreshChaoticVersions();
  }

  private takeDeployedBuilds(event: DatabaseSuccessEvent): Partial<Build>[] {
    const remaining: PendingDeploymentCheck[] = [];
    const taken: Partial<Build>[] = [];
    const now = Date.now();

    for (const pending of this.pendingDeploymentChecks) {
      if (now - pending.queuedAt >= PENDING_DEPLOYMENT_TIMEOUT_MS) {
        this.pino.warn(
          `No deployment announcement for ${pending.pkgname} within ${PENDING_DEPLOYMENT_TIMEOUT_MINUTES} minutes, dropping the deferred check`,
        );
        continue;
      }
      if (pending.targetRepo === event.target_repo && pending.pkgbase === event.pkgname) {
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
      this.pino.error(`Deferred bump check failed for ${build.pkgbase?.pkgname}: ${errorMessage(err)}`);
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
}
