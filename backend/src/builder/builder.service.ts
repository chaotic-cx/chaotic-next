import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import IORedis from 'ioredis';
import { type Context, Service, ServiceBroker } from 'moleculer';
import { IsNull, Not, Repository } from 'typeorm';
import { generateNodeId, nDaysInPast } from '../functions';
import { BuilderDbConnections, BuildStatus, MoleculerBuildObject } from '../types';
import { Build, Builder, builderExists, Package, pkgnameExists, Repo, repoExists } from './builder.entity';
import { brokerConfig, MoleculerConfigCommonService } from './moleculer.config';
import { RepoManagerService } from '../repo-manager/repo-manager.service';
import { Subject } from 'rxjs';
import { EventService } from '../events/event.service';

@Injectable()
export class BuilderService {
  private broker: ServiceBroker;
  private readonly connection: IORedis;

  constructor(
    @InjectRepository(Build)
    private buildRepository: Repository<Build>,
    @InjectRepository(Builder)
    private builderRepository: Repository<Builder>,
    @InjectRepository(Repo)
    private repoRepository: Repository<Repo>,
    @InjectRepository(Package)
    private packageRepository: Repository<Package>,
    private configService: ConfigService,
    private eventService: EventService,
    private repoManagerService: RepoManagerService,
  ) {
    const redisPassword: string = this.configService.get<string | undefined>('redis.password');
    const redisHost: string = this.configService.get<string>('redis.host');
    const redisPort: number = this.configService.get<number>('redis.port');

    try {
      this.connection = new IORedis(redisPort, redisHost, {
        lazyConnect: true,
        maxRetriesPerRequest: null,
        password: redisPassword,
      });
    } catch (err: unknown) {
      Logger.error(err, 'BuilderService');
      return;
    }

    const dbConnections: BuilderDbConnections = {
      build: this.buildRepository,
      builder: this.builderRepository,
      package: this.packageRepository,
      repo: this.repoRepository,
    };

    try {
      this.connection.connect().then(() => {
        this.broker = new ServiceBroker(brokerConfig(generateNodeId(), this.connection));
        this.broker.createService(
          new BuilderDatabaseService(this.broker, dbConnections, this.repoManagerService, {
            sseSubject: this.eventService.sseEvents$,
          }),
        );
        void this.broker.start();
      });
    } catch (err: unknown) {
      Logger.error(err, 'BuilderService');
    }
  }

  /**
   * Returns all builders from the database.
   */
  async getBuilders(options?: any): Promise<Builder[]> {
    return this.builderRepository.find({ cache: { id: 'builders-general', milliseconds: 30000 } });
  }

  /**
   * Returns all packages from the database.
   * @param options An object containing whether to include repo information or not
   */
  async getPackages(options?: { repo: boolean }): Promise<Package[]> {
    return this.packageRepository.find({
      cache: { id: 'packages-general', milliseconds: 30000 },
      loadRelationIds: true,
      relations: options.repo ? ['repo'] : [],
      // Null would be packages requested via the router, which are not in the repository database
      where: { version: Not(IsNull()), isActive: true },
      order: { pkgname: 'ASC' },
    });
  }

  /**
   * Returns all repos from the database.
   */
  async getRepos(options?: any): Promise<Repo[]> {
    return this.repoRepository.find({
      cache: { id: 'repos-general', milliseconds: 30000 },
      where: { isActive: true },
      select: { id: true, name: true, repoUrl: true, gitRef: true, dbPath: true },
    });
  }

  /**
   * Returns all builds from the database.
   */
  async getBuilds(options?: { offset: number; amount: number; builder?: string }): Promise<Build[]> {
    return this.buildRepository
      .createQueryBuilder('build')
      .leftJoinAndSelect('build.pkgbase', 'package')
      .leftJoinAndSelect('build.builder', 'builder')
      .leftJoinAndSelect('build.repo', 'repo')
      .orderBy('build.id', 'DESC')
      .skip(options.offset)
      .take(options.amount)
      .cache(`builds-general-${options.builder}-${options.amount}-${options.offset}`, 1000)
      .getMany();
  }

  /**
   * Returns a build from the database.
   * @param options An object containing the amount to look back and the offset
   * @returns The last n builds, unless an offset is provided
   */
  async getLastBuilds(options: { offset: number; amount: number; status?: BuildStatus }): Promise<Build[]> {
    if (!options.status) {
      return await this.buildRepository
        .createQueryBuilder('build')
        .leftJoinAndSelect('build.pkgbase', 'package')
        .leftJoinAndSelect('build.builder', 'builder')
        .leftJoinAndSelect('build.repo', 'repo')
        .orderBy('build.id', 'DESC')
        .skip(options.offset)
        .take(options.amount)
        .cache(`builds-latest-${options.amount}-${options.offset}`, 30000)
        .getMany();
    } else {
      return await this.buildRepository
        .createQueryBuilder('build')
        .leftJoinAndSelect('build.pkgbase', 'package')
        .leftJoinAndSelect('build.builder', 'builder')
        .leftJoinAndSelect('build.repo', 'repo')
        .where('build.status = :status', { status: options.status })
        .orderBy('build.id', 'DESC')
        .skip(options.offset)
        .take(options.amount)
        .cache(`builds-latest-${options.status}-${options.amount}-${options.offset}`, 30000)
        .getMany();
    }
  }

  /**
   * Returns the last build for a specific package.
   * @param options The package name, amount to look back and offset
   * @returns The last n builds for a specific package
   */
  async getLastBuildsForPackage(options: { pkgname: string; amount: number; offset: number }): Promise<Build[]> {
    return this.buildRepository
      .createQueryBuilder('build')
      .leftJoinAndSelect('build.pkgbase', 'package')
      .leftJoinAndSelect('build.builder', 'builder')
      .leftJoinAndSelect('build.repo', 'repo')
      .where('package.pkgname = :pkgname', { pkgname: options.pkgname })
      .orderBy('build.id', 'DESC')
      .skip(options.offset)
      .take(options.amount)
      .cache(`builds-latest-pkg-${options.pkgname}-${options.amount}-${options.offset}`, 30000)
      .getMany();
  }

  /**
   * Returns the build count for a specific package.
   * @param pkgname The package name to look for
   * @returns The build count for a specific package
   */
  getLastBuildsCountForPackage(pkgname: string): Promise<number> {
    return this.buildRepository.count({
      where: { pkgbase: { pkgname } },
      cache: { id: `builds_count_${pkgname}`, milliseconds: 30000 },
    });
  }

  /**
   * Returns the build count for a specific package per day.
   * @param options The package name and amount to look back, or the offset.
   * @returns The build count for a specific package per day
   */
  async getBuildsCountByPkgnamePerDay(options: {
    pkgname: string;
    amount: number;
    offset: number;
  }): Promise<{ day: string; count: string }[]> {
    const requestedPackage = await this.packageRepository.findOne({ where: { pkgname: options.pkgname } });
    if (!requestedPackage) {
      throw new NotFoundException('Package not found');
    }

    return this.buildRepository
      .createQueryBuilder('build')
      .select("DATE_TRUNC('day', build.timestamp) AS day")
      .addSelect('COUNT(*) AS count')
      .where('build.pkgbase = :id', { id: requestedPackage.id })
      .groupBy('day')
      .orderBy('day', 'DESC')
      .skip(options.offset)
      .take(options.amount)
      .cache(`builds-${options.pkgname}-per-day-${options.amount}-${options.offset}`, 30000)
      .getRawMany();
  }

  /**
   * Returns the most frequently built packages.
   * @param options The amount and offset, optionally a numeric status, as an object.
   * @returns The most frequently built packages
   */
  getPopularPackages(options: {
    amount: number;
    offset: number;
    status: number;
  }): Promise<{ pkgname: string; count: string }[]> {
    if (options.status) {
      return this.builderRepository
        .createQueryBuilder('build')
        .select('pkgbase.pkgname')
        .addSelect('COUNT(*) AS count')
        .innerJoin('build.pkgbase', 'pkgbase')
        .groupBy('pkgbase.pkgname')
        .orderBy('count', 'DESC')
        .where('build.status = :status', { status: options.status })
        .skip(options.offset)
        .take(options.amount)
        .cache(`popular-packages-${options.amount}-${options.offset}-${options.status}`, 30000)
        .getRawMany();
    }
    return this.buildRepository
      .createQueryBuilder('build')
      .select('pkgbase.pkgname')
      .addSelect('COUNT(*) AS count')
      .innerJoin('build.pkgbase', 'pkgbase')
      .groupBy('pkgbase.pkgname')
      .orderBy('count', 'DESC')
      .skip(options.offset)
      .take(options.amount)
      .cache(`popular-packages-${options.amount}-${options.offset}`, 30000)
      .cache(true)
      .getRawMany();
  }

  /**
   * Returns the number of builds per builder.
   * @returns The number of builds per builder
   */
  getBuildsPerBuilder(): Promise<{ builderId: string; count: string }[]> {
    return this.buildRepository
      .createQueryBuilder('build')
      .select('build.builder')
      .addSelect('COUNT(*) AS count')
      .innerJoin('build.builder', 'builder')
      .groupBy('build.builder')
      .cache('builds-per-builder', 30000)
      .getRawMany();
  }

  getBuildsPerDay(options: { days: number }): Promise<{ day: string; count: string }[]> {
    return this.buildRepository
      .createQueryBuilder('build')
      .select("DATE_TRUNC('day', build.timestamp) AS day")
      .addSelect('COUNT(*) AS count')
      .groupBy('day')
      .orderBy('day', 'DESC')
      .take(options.days)
      .cache(`builds-per-day-${options.days}`, 30000)
      .getRawMany();
  }

  async getStatusOfBuilds(options: { days: number }): Promise<{ status: string; count: string }[]> {
    return await this.buildRepository
      .createQueryBuilder('build')
      .select('build.status')
      .addSelect('COUNT(*) AS count')
      .groupBy('build.status')
      .orderBy('count', 'DESC')
      .cache(`status-of-builds-${options.days}`, 30000)
      .getRawMany();
  }

  async getCountPerDay(options: { days: number; offset: number }): Promise<{ day: string; count: string }[]> {
    return await this.buildRepository
      .createQueryBuilder('build')
      .select("DATE_TRUNC('day', build.timestamp) AS day")
      .addSelect('COUNT(*) AS count')
      .groupBy('day')
      .orderBy('day', 'DESC')
      .cache(`count-per-day-${options.days}-${options.offset}`, 30000)
      .take(options.days ?? 30)
      .skip(options.offset ?? 0)
      .getRawMany();
  }

  async buildsPerDay(options: { days: number; offset: number }): Promise<{ day: string; count: string }[]> {
    return await this.buildRepository
      .createQueryBuilder('build')
      .select("DATE_TRUNC('day', build.timestamp) AS day")
      .addSelect('COUNT(*) AS count')
      .groupBy('day')
      .orderBy('day', 'DESC')
      .cache(`build-counts-per-day-${options.days}`, 30000)
      .take(options.days ?? 30)
      .skip(options.offset ?? 0)
      .getRawMany();
  }

  async getBuildsPerRepo(): Promise<{ repo: string; count: string }[]> {
    return await this.buildRepository
      .createQueryBuilder('build')
      .select('repo.name AS repo')
      .addSelect('COUNT(*) AS count')
      .innerJoin('build.repo', 'repo')
      .groupBy('build.repo')
      .cache(`builds-per-repo`, 30000)
      .getRawMany();
  }

  /**
   * Returns the number of builds per package.
   * @param options The amount to look back
   * @returns The number of builds per package
   */
  getBuildsPerPackage(options?: { days: number }): Promise<{ pkgbase: string; count: string }[]> {
    if (!options?.days) {
      return this.buildRepository
        .createQueryBuilder('build')
        .select('pkgbase.pkgname AS pkgbase')
        .addSelect('COUNT(*) AS count')
        .innerJoin('build.pkgbase', 'pkgbase')
        .groupBy('pkgbase.pkgname')
        .orderBy('count', 'DESC')
        .cache(`builds-per-package`, 30000)
        .getRawMany();
    } else {
      return this.buildRepository
        .createQueryBuilder('build')
        .select('pkgbase.pkgname AS pkgbase')
        .addSelect('COUNT(*) AS count')
        .innerJoin('build.pkgbase', 'pkgbase')
        .where('build.timestamp > :date', { date: nDaysInPast(options.days) })
        .groupBy('pkgbase.pkgname')
        .orderBy('count', 'DESC')
        .cache(`builds-per-package-${options.days}`, 30000)
        .getRawMany();
    }
  }

  /**
   * Returns the average build time per status.
   * @returns The average build time per status
   */
  async getAverageBuildTimePerStatus(): Promise<{ status: string; average_build_time: string }[]> {
    return await this.buildRepository
      .createQueryBuilder('build')
      .select('AVG("timeToEnd") AS average_build_time')
      .addSelect('status')
      .where('"timeToEnd" IS NOT NULL')
      .groupBy('status')
      .orderBy('average_build_time', 'DESC')
      .cache(`average-build-time-per-status`, 30000)
      .getRawMany();
  }

  /**
   * Returns the latest builds.
   * @param options The amount and offset
   * @returns The latest builds with commit URL, commit hash, time to end, package name, and version
   */
  async getLatestBuilds(options: {
    amount: number;
    offset: number;
  }): Promise<{ logUrl: string; commit: string; timeToEnd: string; pkgname: string; version: string }[]> {
    return await this.buildRepository
      .createQueryBuilder('build')
      .select('b."logUrl"')
      .addSelect('b."commit"')
      .addSelect('b."timeToEnd"')
      .addSelect('p."pkgname"')
      .addSelect('p."version"')
      .from(Build, 'b')
      .innerJoin('b.pkgbase', 'p')
      .orderBy('p."lastUpdated"', 'DESC')
      .take(options.amount ?? 100)
      .skip(options.offset ?? 0)
      .cache(`latest-builds`, 30000)
      .getRawMany();
  }

  async getPackage(name: string) {
    return await this.packageRepository.findOne({ where: { pkgname: name } });
  }
}

/**
 * The metrics service that provides the metrics actions for other services to call.
 */
export class BuilderDatabaseService extends Service {
  private dbConnections: BuilderDbConnections;
  private repoManagerService: RepoManagerService;

  private readonly sseSubject$: Subject<Partial<MessageEvent>>;

  busyUpdating = false;
  scheduledUpdate = false;

  constructor(
    broker: ServiceBroker,
    dbConnections: BuilderDbConnections,
    repoManagerService: RepoManagerService,
    options: { sseSubject: Subject<Partial<MessageEvent>> },
  ) {
    super(broker);

    this.sseSubject$ = options.sseSubject;

    this.parseServiceSchema({
      name: 'builderDatabaseService',
      events: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        'builds.*'(ctx: Context<MoleculerBuildObject>) {
          this.logBuild(ctx);
        },
        // eslint-disable-next-line @typescript-eslint/naming-convention
        'database.removalCompleted'(ctx: Context<string[]>) {
          this.removeEntries(ctx);
        },
      },
      ...MoleculerConfigCommonService,
    });

    this.repoManagerService = repoManagerService;
    this.dbConnections = dbConnections;

    Logger.log('BuilderDatabaseService created', 'BuilderDatabaseService');
  }

  /**
   * Logs a new build to the database.
   * @param ctx The Moleculer context object containing the build object
   */
  async logBuild(ctx: Context<MoleculerBuildObject>): Promise<void> {
    // These events are not relevant as they miss required data
    if (ctx.eventName.endsWith('Histogram')) return;

    const params = ctx.params;

    // No point in logging if the required fields are missing. Database will throw an error anyway.
    if (!params.builder_name || !params.target_repo || !params.pkgname) {
      Logger.error('Missing required fields, throwing entry away', 'BuilderDatabaseService');
      return;
    }

    const relations: [Builder, Repo] = await Promise.all([
      builderExists(params.builder_name, this.dbConnections.builder),
      repoExists(params.target_repo, this.dbConnections.repo),
    ]);
    const pkg: Package = await pkgnameExists(params.pkgname, this.dbConnections.package, relations[1]);

    if (relations.includes(undefined)) {
      Logger.error('Invalid relations or database is not available, throwing entry away', 'BuilderDatabaseService');
      return;
    }

    pkg.lastUpdated = new Date().toISOString();

    const build: Partial<Build> = {
      arch: params.arch,
      buildClass: params.build_class ? params.build_class.toString() : null,
      builder: relations[0],
      logUrl: params.logUrl,
      timeToEnd: params.duration,
      commit: params.commit.split(':')[0],
      pkgbase: pkg,
      repo: relations[1],
      status: params.status,
      replaced: params.replaced,
    };

    // Update the chaotic versions as they changed with new successful builds
    if (params.status === BuildStatus.SUCCESS) {
      try {
        const promises: Promise<void>[] = [
          this.repoManagerService.eventuallyBumpAffected(build),
          this.repoManagerService.processNamcapAnalysis(build as Build, params.namcapAnalysis),
        ];

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
          Logger.warn('Scheduling Chaotic version update, another update is in progress', 'BuilderDatabaseService');
          this.scheduledUpdate = true;
        }

        await Promise.allSettled(promises);
      } catch (err: unknown) {
        Logger.error(err, 'RepoManager');
      }
    }

    try {
      Logger.debug(await this.dbConnections.build.save(build), 'BuilderDatabaseService');

      // Notify SSE clients about the build and newly updated package
      this.sseSubject$.next({
        data: {
          type: 'build',
          package: build.pkgbase.pkgname,
          version: build.pkgbase.version,
          pkgrel: build.pkgbase.pkgrel,
          duration: build.timeToEnd,
          repo: build.repo.name,
          status: build.status,
        },
      });
    } catch (err: unknown) {
      Logger.error(err, 'BuilderDatabaseService');
    }
  }

  /**
   * Removes entries from the database.
   * @param ctx The Moleculer context object containing the package names to remove
   */
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
        Logger.log(`Removed ${pkgbase} from the database active records`, 'BuilderDatabaseService');
      }
    } catch (err: unknown) {
      Logger.error(err, 'BuilderDatabaseService');
    }
  }
}
