import { ChaoticEvent, MoleculerCurrentQueueObject } from '@chaotic-next/shared-lib';
import { type Context, Service, type ServiceBroker } from 'moleculer';
import { Subject } from 'rxjs';
import { GitlabService } from '../gitlab/gitlab.service';
import { GitlabStatusEvent } from '../gitlab/interfaces';
import { RepoManagerService } from '../repo-manager/repo-manager.service';
import { BuilderDbConnections, BuildStatus, MoleculerBuildObject } from '../types/types';
import { errorMessage } from '../utils/functions';
import { Build, getOrCreateBuilder, Package, getOrCreatePackage, getOrCreateRepo } from './builder.entity';
import { moleculerConfigCommonService } from './moleculer.config';

export interface BuilderDatabaseServiceOptions {
  broker: ServiceBroker;
  dbConnections: BuilderDbConnections;
  repoManagerService: RepoManagerService;
  sseSubject: Subject<Partial<MessageEvent<ChaoticEvent>>>;
  gitlabService: GitlabService;
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

  busyUpdating = false;
  scheduledUpdate = false;

  constructor({ broker, dbConnections, repoManagerService, sseSubject, gitlabService }: BuilderDatabaseServiceOptions) {
    super(broker);

    this.sseSubject$ = sseSubject;
    this.gitlabService = gitlabService;

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
        'metrics.currentQueue'(ctx: Context<MoleculerCurrentQueueObject>) {
          this.sseSubject$.next({
            data: {
              type: 'queue',
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
    // These events are not relevant as they miss required data
    if (ctx.eventName?.endsWith('Histogram')) return;

    const params = ctx.params;

    // No point in logging if the required fields are missing. Database will throw an error anyway.
    if (
      !params.builder_name ||
      !params.target_repo ||
      !params.pkgname ||
      params.duration === undefined ||
      params.status === undefined
    ) {
      this.logger.error('Missing required fields, throwing entry away');
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

    // Update the chaotic versions as they changed with new successful builds
    if (params.status === BuildStatus.SUCCESS) {
      try {
        const promises: Promise<void>[] = [this.repoManagerService.eventuallyBumpAffected(build)];

        if (this.busyUpdating === false) {
          this.busyUpdating = true;
          promises.push(
            (async () => {
              await this.repoManagerService.updateChaoticVersions();
              if (this.scheduledUpdate) {
                this.scheduledUpdate = false;
                await this.repoManagerService.updateChaoticVersions();
              } else {
                this.scheduledUpdate = false;
              }
            })(),
          );
        } else {
          this.logger.warn('Scheduling Chaotic version update, another update is in progress');
          this.scheduledUpdate = true;
        }

        await Promise.allSettled(promises);
      } catch (err: unknown) {
        this.logger.error(err);
      }
    }

    try {
      this.logger.debug(await this.dbConnections.build.save(build));

      // Notify SSE clients about the build and newly updated package
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
