import { EventService } from '../events/event.service';
import IORedis from 'ioredis';
import { GitlabPipelineService } from '../gitlab/gitlab-pipeline.service';
import { RepoManagerService } from '../repo-manager/repo-manager.service';
import { BuildStatus } from '../types/types';
import { CACHE_TTL_MS, MAX_AMOUNT, MAX_DAYS_PER_DAY_CHART, MAX_DAYS_WINDOW, MAX_OFFSET } from '../utils/constants';
import { clampInt, generateNodeId, nDaysInPast, whitelistSort } from '../utils/functions';
import { paginate, resolveOrder, resolvePagination } from '../utils/pagination';
import { BuildClassSyncService } from './build-class-sync.service';
import { BuildFailureNotifierService } from './build-failure-notifier.service';
import { BuilderDatabaseService } from './builder-database.service';
import { Build, Builder, Package, Repo, SilencedBuildFailure } from './builder.entity';
import { brokerConfig } from './moleculer.config';
import { EntityLookupService } from './entity-lookup.service';
import {
  BUILD_RESOURCE_COLUMNS,
  DAY_ROW_KEYS,
  HEAVY_RESOURCE_METRIC_EXPRESSIONS,
  isBuildResourceSortField,
  type BuildResourceMetricKey,
} from './resource-stats';
import {
  FLAKY_ATTEMPT_STATUSES,
  SHOULD_BUILD_MAX_RECENT_BUILDS,
  SHOULD_BUILD_TRAILING_DAYS,
  shouldBuildDecision,
  type UnresolvedFailureRow,
  UNRESOLVED_FAILURE_LIMIT,
  UNRESOLVED_FAILURE_LOOKBACK_DAYS,
  unresolvedFailedBuildFromRow,
} from './unresolved-failures';
import {
  BUILD_FAILURE_STATUSES,
  BUILD_SUCCESS_STATUSES,
  BUILD_VERDICT_STATUSES,
  buildClassSortKey,
  type Package as PackageDto,
  type PackageResourceDayRow,
  type Paginated,
  type ShouldBuildDecision,
  type UnresolvedFailedBuild,
} from '@chaotic-next/shared-lib';
import { Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { ServiceBroker } from 'moleculer';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Repository, SelectQueryBuilder } from 'typeorm';

/** Packages need this many genuine attempts inside the window before they can be called flaky. */
const MIN_FLAKINESS_ATTEMPTS = 5;

export interface FlakyPackageRow {
  pkgname: string;
  attempts: number;
  failures: number;
  flakiness: number;
}

export interface BuilderUtilizationRow {
  builder: string;
  hour: number;
  count: number;
}

@Injectable()
export class BuilderService implements OnModuleInit, OnModuleDestroy {
  private broker?: ServiceBroker;
  private readonly connection?: IORedis;

  constructor(
    @InjectRepository(Build)
    private buildRepository: Repository<Build>,
    @InjectRepository(Builder)
    private builderRepository: Repository<Builder>,
    @InjectRepository(Repo)
    private repoRepository: Repository<Repo>,
    @InjectRepository(Package)
    private packageRepository: Repository<Package>,
    @InjectRepository(SilencedBuildFailure)
    private silencedFailureRepository: Repository<SilencedBuildFailure>,
    private configService: ConfigService,
    private eventService: EventService,
    private repoManagerService: RepoManagerService,
    private gitlabPipelineService: GitlabPipelineService,
    private buildClassSyncService: BuildClassSyncService,
    private buildFailureNotifierService: BuildFailureNotifierService,
    private readonly lookup: EntityLookupService,
    @InjectPinoLogger(BuilderService.name) private readonly pino: PinoLogger,
  ) {
    const redisPassword: string | undefined = this.configService.get<string | undefined>('redis.password');
    const redisHost: string = this.configService.getOrThrow<string>('redis.host');
    const redisPort: number = this.configService.getOrThrow<number>('redis.port');

    try {
      const connection = new IORedis(redisPort, redisHost, {
        lazyConnect: true,
        maxRetriesPerRequest: null,
        password: redisPassword,
      });
      let redisErrorLogged = false;
      connection.on('error', (err: Error) => {
        if (connection.status === 'end' || connection.status === 'close') {
          return;
        }
        if (!redisErrorLogged) {
          redisErrorLogged = true;
          this.pino.error({ err }, 'Redis connection error');
        }
      });
      this.connection = connection;
    } catch (err: unknown) {
      this.pino.error({ err }, 'Redis connection setup failed');
    }
  }

  onModuleInit() {
    // Fire-and-forget: don't block startup on broker connection/registration.
    void this.initBroker().catch((err: unknown) => {
      this.pino.error({ err }, 'Broker init failed');
    });
  }

  async initBroker() {
    if (!this.connection) {
      this.pino.error('Broker init skipped: Redis connection could not be established');
      return;
    }
    const dbConnections = {
      build: this.buildRepository,
      builder: this.builderRepository,
      package: this.packageRepository,
      repo: this.repoRepository,
      silencedFailure: this.silencedFailureRepository,
    };

    try {
      await this.connection.connect();

      this.broker = new ServiceBroker(brokerConfig(generateNodeId(), this.connection));
      this.broker.createService(
        new BuilderDatabaseService({
          broker: this.broker,
          dbConnections,
          lookup: this.lookup,
          repoManagerService: this.repoManagerService,
          sseSubject: this.eventService.sseEvents$,
          gitlabPipelineService: this.gitlabPipelineService,
          buildClassSync: this.buildClassSyncService,
          buildFailureNotifier: this.buildFailureNotifierService,
        }),
      );
      await this.broker.start();
      this.pino.info('Moleculer broker started');
    } catch (err: unknown) {
      this.pino.error({ err }, 'Broker init failed');
    }
  }

  async onModuleDestroy() {
    if (this.broker) {
      try {
        await this.broker.stop();
      } catch {
        // Ignore broker stop errors on teardown
      }
    }
    if (this.connection) {
      this.connection.disconnect();
    }
  }

  async getBuilders(): Promise<Builder[]> {
    return this.builderRepository.find({ cache: { id: 'builders-general', milliseconds: CACHE_TTL_MS } });
  }

  async getPackages(options: {
    page?: number;
    perPage?: number;
    q?: string;
    sort?: string;
    order?: string;
    repo?: boolean;
    repoId?: number;
  }): Promise<Paginated<PackageDto>> {
    const { page, perPage, skip } = resolvePagination(options.page, options.perPage);
    const query = this.packageRepository
      .createQueryBuilder('package')
      .leftJoin('package.repo', 'repo')
      .addSelect('package')
      .addSelect('repo.id')
      .addSelect('repo.name')
      .where('package.version IS NOT NULL')
      .andWhere('package.isActive = :isActive', { isActive: true });

    if (options.q) {
      query.andWhere(
        `(package.pkgname ILIKE :q OR package.version ILIKE :q OR package.metadata->>'desc' ILIKE :q OR package.metadata->>'url' ILIKE :q)`,
        { q: `%${options.q}%` },
      );
    }
    if (options.repoId !== undefined) {
      query.andWhere('package.repoId = :repoId', { repoId: options.repoId });
    }

    const order = resolveOrder(options.order);
    // Null `createdAt` rows (packages with no build history) must not surface
    // as "recently added": Postgres sorts NULLs first in DESC, so force them last.
    query.orderBy(
      this.packageSortExpression(options.sort),
      order,
      options.sort === 'createdAt' ? 'NULLS LAST' : undefined,
    );

    const [items, total] = await query.skip(skip).take(perPage).getManyAndCount();

    // The frontend consumes `repo` as the numeric id (RepoNamePipe) plus a
    // resolved `reponame`. Never leak the repo's apiToken, so only select the name.
    const mapped: PackageDto[] = items.map((pkg) => ({
      id: pkg.id,
      pkgname: pkg.pkgname,
      lastUpdated: pkg.lastUpdated,
      createdAt: pkg.createdAt,
      isActive: pkg.isActive,
      version: pkg.version,
      bumpCount: pkg.bumpCount,
      bumpTriggers: pkg.bumpTriggers ?? undefined,
      metadata: pkg.metadata,
      pkgrel: pkg.pkgrel,
      bump: pkg.bump,
      buildClass: pkg.buildClass,
      pkgbaseName: pkg.pkgbaseName,
      repo: pkg.repo?.id,
      reponame: pkg.repo?.name,
    }));
    return paginate(mapped, total, page, perPage);
  }

  private packageSortExpression(sort?: string): string {
    return whitelistSort(sort ?? 'pkgname', 'package.pkgname', {
      id: 'package.id',
      pkgname: 'package.pkgname',
      lastUpdated: 'package.lastUpdated',
      createdAt: 'package.createdAt',
      version: 'package.version',
      pkgrel: 'package.pkgrel',
      buildClass: 'package.buildClass',
      pkgbaseName: 'package.pkgbaseName',
      repo: 'repo.name',
    });
  }

  async getRepos(): Promise<Repo[]> {
    return this.repoRepository.find({
      cache: { id: 'repos-general', milliseconds: CACHE_TTL_MS },
      where: { isActive: true },
      select: { id: true, name: true, repoUrl: true, gitRef: true, dbPath: true },
    });
  }

  async getBuilds(options: {
    page?: number;
    perPage?: number;
    q?: string;
    builder?: string;
    repo?: string;
    status?: BuildStatus;
    sort?: string;
    order?: string;
  }): Promise<Paginated<Build>> {
    const { page, perPage, skip } = resolvePagination(options.page, options.perPage);
    const query = this.buildRepository
      .createQueryBuilder('build')
      .leftJoin('build.pkgbase', 'package')
      .addSelect('package.pkgname')
      .leftJoin('build.builder', 'builder')
      .addSelect('builder.name')
      .leftJoin('build.repo', 'repo')
      .addSelect('repo.name');

    if (options.builder) {
      query.andWhere('builder.name = :builder', { builder: options.builder });
    }

    if (options.repo) {
      query.andWhere('repo.name = :repo', { repo: options.repo });
    }

    if (options.status !== undefined) {
      query.andWhere('build.status = :status', { status: options.status });
    }

    if (options.q) {
      query.andWhere(
        '(package.pkgname ILIKE :q OR builder.name ILIKE :q OR repo.name ILIKE :q OR build.commit ILIKE :q)',
        { q: `%${options.q}%` },
      );
    }

    // Postgres puts NULLs first in DESC order, which would lead rankings with
    // unsampled builds; resource counters must therefore sort NULLS LAST.
    const isResourceSort = isBuildResourceSortField(options.sort ?? '');
    query.orderBy(
      this.buildSortExpression(options.sort),
      resolveOrder(options.order),
      isResourceSort ? 'NULLS LAST' : undefined,
    );

    const [items, total] = await query.offset(skip).limit(perPage).getManyAndCount();
    return paginate(items, total, page, perPage);
  }

  private buildSortExpression(sort?: string): string {
    return whitelistSort(sort ?? 'id', 'build.id', {
      id: 'build.id',
      timestamp: 'build.timestamp',
      timeToEnd: 'build.timeToEnd',
      status: 'build.status',
      pkgname: 'package.pkgname',
      builder: 'builder.name',
      repo: 'repo.name',
      peakMemory: BUILD_RESOURCE_COLUMNS.peakMemory,
      cpuTime: BUILD_RESOURCE_COLUMNS.cpuTime,
      diskIo: `(${BUILD_RESOURCE_COLUMNS.diskRead} + ${BUILD_RESOURCE_COLUMNS.diskWrite})`,
      networkIo: `(${BUILD_RESOURCE_COLUMNS.networkRx} + ${BUILD_RESOURCE_COLUMNS.networkTx})`,
    });
  }

  async getLastBuilds(options: { offset: number; amount: number; status?: BuildStatus }): Promise<Build[]> {
    const amount = clampInt(options.amount, 1, MAX_AMOUNT);
    const offset = clampInt(options.offset, 0, MAX_OFFSET);
    const query = this.buildRepository
      .createQueryBuilder('build')
      .leftJoin('build.pkgbase', 'package')
      .addSelect('package.pkgname')
      .leftJoin('build.builder', 'builder')
      .addSelect('builder.name')
      .leftJoin('build.repo', 'repo')
      .addSelect('repo.name')
      .orderBy('build.id', 'DESC');

    if (options.status !== undefined) {
      query.where('build.status = :status', { status: options.status });
    }

    return query
      .skip(offset)
      .take(amount)
      .cache(`builds-latest-${options.status ?? 'all'}-${amount}-${offset}`, CACHE_TTL_MS)
      .getMany();
  }

  async getLastBuildsForPackage(options: { pkgname: string; amount: number; offset: number }): Promise<Build[]> {
    const amount = clampInt(options.amount, 1, MAX_AMOUNT);
    const offset = clampInt(options.offset, 0, MAX_OFFSET);
    return this.buildRepository
      .createQueryBuilder('build')
      .leftJoin('build.pkgbase', 'package')
      .addSelect('package.pkgname')
      .leftJoin('build.builder', 'builder')
      .addSelect('builder.name')
      .leftJoin('build.repo', 'repo')
      .addSelect('repo.name')
      .where('package.pkgname = :pkgname', { pkgname: options.pkgname })
      .orderBy('build.id', 'DESC')
      .skip(offset)
      .take(amount)
      .cache(`builds-latest-pkg-${options.pkgname}-${amount}-${offset}`, CACHE_TTL_MS)
      .getMany();
  }

  getLastBuildsCountForPackage(pkgname: string): Promise<number> {
    return this.buildRepository.count({
      where: { pkgbase: { pkgname } },
      cache: { id: `builds_count_${pkgname}`, milliseconds: CACHE_TTL_MS },
    });
  }

  async getBuildsCountByPkgnamePerDay(options: {
    pkgname: string;
    amount: number;
    offset: number;
  }): Promise<{ day: string; repo: string; count: string }[]> {
    const requestedPackage = await this.packageRepository.findOne({ where: { pkgname: options.pkgname } });
    if (!requestedPackage) {
      throw new NotFoundException('Package not found');
    }

    const amount = clampInt(options.amount, 1, MAX_DAYS_PER_DAY_CHART);
    const offset = clampInt(options.offset, 0, MAX_OFFSET);

    return this.buildRepository
      .createQueryBuilder('build')
      .select("DATE_TRUNC('day', build.timestamp) AS day")
      .addSelect('repo.name AS repo')
      .addSelect('COUNT(*) AS count')
      .innerJoin('build.repo', 'repo')
      .innerJoin('build.pkgbase', 'pkgbase')
      .where('pkgbase.pkgname = :pkgname', { pkgname: options.pkgname })
      .andWhere('build.timestamp > :date', { date: nDaysInPast(amount) })
      .groupBy("DATE_TRUNC('day', build.timestamp), repo.name")
      .orderBy('day', 'DESC')
      .limit(amount)
      .offset(offset)
      .cache(`builds-${options.pkgname}-per-day-repo-${amount}-${offset}`, CACHE_TTL_MS)
      .getRawMany();
  }

  async getAverageBuildTimePerDayForPackage(options: {
    pkgname: string;
    days: number;
  }): Promise<{ day: string; average: string }[]> {
    const requestedPackage = await this.packageRepository.findOne({ where: { pkgname: options.pkgname } });
    if (!requestedPackage) {
      throw new NotFoundException('Package not found');
    }

    const days = clampInt(options.days, 1, MAX_DAYS_WINDOW);

    return this.buildRepository
      .createQueryBuilder('build')
      .select("DATE_TRUNC('day', build.timestamp AT TIME ZONE 'UTC') AS day")
      .addSelect('AVG(build.timeToEnd) AS average')
      .innerJoin('build.pkgbase', 'pkgbase')
      .where('pkgbase.pkgname = :pkgname', { pkgname: options.pkgname })
      .andWhere('build.timeToEnd IS NOT NULL')
      .andWhere('build.status = :status', { status: BuildStatus.SUCCESS })
      .andWhere('build.timestamp > :date', { date: nDaysInPast(days) })
      .groupBy("DATE_TRUNC('day', build.timestamp AT TIME ZONE 'UTC')")
      .orderBy('day', 'DESC')
      .limit(days)
      .cache(`avg-build-time-${options.pkgname}-per-day-${days}`, CACHE_TTL_MS)
      .getRawMany();
  }

  getPopularPackages(options: {
    amount: number;
    offset: number;
    status?: number;
    days?: number;
  }): Promise<{ pkgbase_pkgname: string; count: string }[]> {
    const amount = clampInt(options.amount, 1, MAX_AMOUNT);
    const offset = clampInt(options.offset, 0, MAX_OFFSET);
    const query = this.buildRepository
      .createQueryBuilder('build')
      .select('pkgbase.pkgname')
      // Count distinct source commits instead of every build row: CI incidents
      // re-queue an already-built commit hundreds of times (status ALREADY_BUILT),
      // which would otherwise inflate the count for e.g. garuda-*-git packages.
      .addSelect('COUNT(DISTINCT build.commit) AS count')
      .innerJoin('build.pkgbase', 'pkgbase')
      .groupBy('pkgbase.pkgname')
      .orderBy('count', 'DESC');

    if (options.status !== undefined) {
      query.where('build.status = :status', { status: options.status });
    }
    if (options.days !== undefined) {
      query.andWhere('build.timestamp > :date', { date: nDaysInPast(clampInt(options.days, 1, MAX_DAYS_WINDOW)) });
    }

    return query
      .limit(amount)
      .offset(offset)
      .cache(
        `popular-packages-distinct-${amount}-${offset}-${options.status ?? 'all'}-${options.days ?? 'all'}`,
        CACHE_TTL_MS,
      )
      .getRawMany();
  }

  getBuildsPerBuilder(days?: number): Promise<{ name: string; count: string }[]> {
    const query = this.buildRepository
      .createQueryBuilder('build')
      .select('builder.name AS name')
      .addSelect('COUNT(*) AS count')
      .innerJoin('build.builder', 'builder')
      .groupBy('builder.name');

    if (days !== undefined) {
      query.where('build.timestamp > :date', { date: nDaysInPast(clampInt(days, 1, MAX_DAYS_WINDOW)) });
    }

    return query.cache(`builds-per-builder-${days ?? 'all'}`, CACHE_TTL_MS).getRawMany();
  }

  getBuildsPerDay(options: { days: number }): Promise<{ day: string; count: string }[]> {
    const days = clampInt(options.days, 1, MAX_DAYS_WINDOW);
    return (
      this.buildRepository
        .createQueryBuilder('build')
        .select("DATE_TRUNC('day', build.timestamp) AS day")
        // Count distinct source commits so CI retry loops (same commit re-queued,
        // status ALREADY_BUILT) don't inflate the daily totals, matching the
        // per-package popular chart.
        .addSelect('COUNT(DISTINCT build.commit) AS count')
        .groupBy('day')
        .orderBy('day', 'DESC')
        .limit(days)
        .cache(`builds-per-day-distinct-${days}`, CACHE_TTL_MS)
        .getRawMany()
    );
  }

  getPackageAdditionsPerDay(options: { days: number }): Promise<{ day: string; count: string }[]> {
    const days = clampInt(options.days, 1, MAX_DAYS_WINDOW);
    return this.packageRepository
      .createQueryBuilder('package')
      .select("DATE_TRUNC('day', package.createdAt AT TIME ZONE 'UTC') AS day")
      .addSelect('COUNT(*) AS count')
      .where('package.createdAt IS NOT NULL')
      .groupBy('day')
      .orderBy('day', 'DESC')
      .limit(days)
      .cache(`package-additions-per-day-${days}`, CACHE_TTL_MS)
      .getRawMany();
  }

  getAverageBuildTimePerDay(options: { days: number }): Promise<{ day: string; status: string; average: string }[]> {
    const days = clampInt(options.days, 1, MAX_DAYS_WINDOW);
    return this.buildRepository
      .createQueryBuilder('build')
      .select("DATE_TRUNC('day', build.timestamp AT TIME ZONE 'UTC') AS day")
      .addSelect('build.status AS status')
      .addSelect('AVG(build.timeToEnd) AS average')
      .where('build.timeToEnd IS NOT NULL')
      .groupBy('day')
      .addGroupBy('build.status')
      .orderBy('day', 'DESC')
      .limit(days)
      .cache(`avg-build-time-per-day-${days}`, CACHE_TTL_MS)
      .getRawMany();
  }

  getFailedBuildHotspots(options: { amount: number; days?: number }): Promise<{ pkgname: string; count: string }[]> {
    const amount = clampInt(options.amount, 1, MAX_AMOUNT);
    const query = this.buildRepository
      .createQueryBuilder('build')
      .select('pkg.pkgname AS pkgname')
      .addSelect('COUNT(*) AS count')
      .innerJoin('build.pkgbase', 'pkg')
      .where('build.status IN (:...failures)', { failures: BUILD_FAILURE_STATUSES });
    if (options.days !== undefined) {
      query.andWhere('build.timestamp > :date', { date: nDaysInPast(clampInt(options.days, 1, MAX_DAYS_WINDOW)) });
    }
    return query
      .groupBy('pkg.pkgname')
      .orderBy('count', 'DESC')
      .limit(amount)
      .cache(`failed-build-hotspots-${amount}-${options.days ?? 'all'}`, CACHE_TTL_MS)
      .getRawMany();
  }

  /**
   * Failed builds per day for the packages that fail most often in the window.
   * The packages are fixed by the top `amount` over the whole window, so the
   * chart always shows the worst offenders rather than a shifting set.
   */
  async getFailedBuildsOverTime(options: {
    amount: number;
    days: number;
  }): Promise<{ day: string; pkgname: string; count: string }[]> {
    const amount = clampInt(options.amount, 1, MAX_AMOUNT);
    const days = clampInt(options.days, 1, MAX_DAYS_WINDOW);
    const date = nDaysInPast(days);

    const top = await this.buildRepository
      .createQueryBuilder('build')
      .select('pkg.pkgname AS pkgname')
      .innerJoin('build.pkgbase', 'pkg')
      .where('build.status IN (:...failures)', { failures: BUILD_FAILURE_STATUSES })
      .andWhere('build.timestamp > :date', { date })
      .groupBy('pkg.pkgname')
      .orderBy('COUNT(*)', 'DESC')
      .limit(amount)
      .getRawMany<{ pkgname: string }>();
    const pkgnames = top.map((row) => row.pkgname);
    if (pkgnames.length === 0) return [];

    return this.buildRepository
      .createQueryBuilder('build')
      .select("DATE_TRUNC('day', build.timestamp AT TIME ZONE 'UTC') AS day")
      .addSelect('pkg.pkgname AS pkgname')
      .addSelect('COUNT(*) AS count')
      .innerJoin('build.pkgbase', 'pkg')
      .where('build.status IN (:...failures)', { failures: BUILD_FAILURE_STATUSES })
      .andWhere('build.timestamp > :date', { date })
      .andWhere('pkg.pkgname IN (:...pkgnames)', { pkgnames })
      .groupBy('day')
      .addGroupBy('pkg.pkgname')
      .orderBy('day', 'DESC')
      .cache(`failed-builds-over-time-${amount}-${days}`, CACHE_TTL_MS)
      .getRawMany<{ day: string; pkgname: string; count: string }>();
  }

  /**
   * Active packages whose latest build verdict is a failure, with no more
   * recent success behind it. Timeout and software-failure count as failing;
   * already-built and skipped count as resolving.
   */
  async getUnresolvedFailedBuilds(options?: { days?: number }): Promise<UnresolvedFailedBuild[]> {
    const since = nDaysInPast(clampInt(options?.days ?? UNRESOLVED_FAILURE_LOOKBACK_DAYS, 1, MAX_DAYS_WINDOW));

    // The streak aggregates count the same set: failures of this package newer
    // than its last resolving build inside the window.
    const failureStreakScope = (qb: SelectQueryBuilder<Build>): SelectQueryBuilder<Build> =>
      qb
        .from(Build, 'f')
        .where('f."pkgbaseId" = l."pkgbaseId"')
        .andWhere('f.timestamp > :since', { since })
        .andWhere('f.status IN (:...failures)', { failures: BUILD_FAILURE_STATUSES })
        .andWhere(
          (sq: SelectQueryBuilder<Build>) =>
            'f.id > (' +
            sq
              .subQuery()
              .select('COALESCE(MAX(r.id), 0)')
              .from(Build, 'r')
              .where('r."pkgbaseId" = f."pkgbaseId"')
              .andWhere('r.timestamp > :since', { since })
              .andWhere('r.status IN (:...successes)', { successes: BUILD_SUCCESS_STATUSES })
              .getQuery() +
            ')',
        );
    const rows = await this.buildRepository
      .createQueryBuilder('l')
      .select('p.pkgname', 'pkgname')
      .addSelect('l.status::text', 'status')
      .addSelect('l.timestamp', 'timestamp')
      .addSelect('l."logUrl"', 'logUrl')
      .addSelect('(s.pkgname IS NOT NULL)', 'silenced')
      .addSelect((qb) => failureStreakScope(qb.select('COUNT(*)::int')), 'consecutiveFailures')
      .addSelect((qb) => failureStreakScope(qb.select('MIN(f.timestamp)')), 'streakStartedAt')
      .innerJoin(Package, 'p', 'p.id = l."pkgbaseId" AND p."isActive" = true')
      .leftJoin(SilencedBuildFailure, 's', 's.pkgname = p.pkgname')
      .where(
        (qb) =>
          'l.id IN (' +
          qb
            .subQuery()
            .select('MAX(b.id)')
            .from(Build, 'b')
            .where('b.timestamp > :since', { since })
            .andWhere('b.status IN (:...verdicts)', { verdicts: BUILD_VERDICT_STATUSES })
            .groupBy('b."pkgbaseId"')
            .getQuery() +
          ')',
      )
      .andWhere('l.status IN (:...failures)', { failures: BUILD_FAILURE_STATUSES })
      .orderBy('l.timestamp', 'DESC')
      .limit(UNRESOLVED_FAILURE_LIMIT)
      .getRawMany<UnresolvedFailureRow>();
    return rows.map(unresolvedFailedBuildFromRow).filter((build): build is UnresolvedFailedBuild => build !== null);
  }

  async silenceUnresolvedFailedBuild(pkgname: string): Promise<void> {
    await this.silencedFailureRepository
      .createQueryBuilder()
      .insert()
      .into(SilencedBuildFailure)
      .values({ pkgname })
      .orIgnore()
      .execute();
  }

  async unsilenceUnresolvedFailedBuild(pkgname: string): Promise<void> {
    await this.silencedFailureRepository.delete({ pkgname });
  }

  /**
   * Whether a build for the pkgbase is likely to succeed. Split packages are
   * covered too: every package row that carries the pkgbase name contributes
   * its builds. Cancellations stay transparent, matching the unresolved list.
   * A package inside a failure loop becomes eligible again once its newest
   * attempt is older than the retry cooldown, so it keeps getting retried.
   */
  async getShouldBuild(pkgbase: string): Promise<ShouldBuildDecision> {
    const since = nDaysInPast(SHOULD_BUILD_TRAILING_DAYS);
    const rows = await this.buildRepository
      .createQueryBuilder('build')
      .select('build.status::text AS status')
      .addSelect('build.timestamp AS timestamp')
      .innerJoin(Package, 'pkg', 'pkg.id = build."pkgbaseId"')
      .where('(pkg."pkgbaseName" = :pkgbase OR pkg.pkgname = :pkgbase)', { pkgbase })
      .andWhere('build.timestamp > :date', { date: since })
      .andWhere('build.status IN (:...verdicts)', { verdicts: BUILD_VERDICT_STATUSES })
      .orderBy('build.id', 'DESC')
      .limit(SHOULD_BUILD_MAX_RECENT_BUILDS)
      .cache(`should-build-${pkgbase}`, CACHE_TTL_MS)
      .getRawMany<{ status: string; timestamp: string | Date }>();
    const newest = rows[0];
    const newestTimestamp = newest === undefined ? undefined : new Date(newest.timestamp).getTime();
    const newestBuildAgeMs =
      newestTimestamp === undefined || Number.isNaN(newestTimestamp) ? null : Date.now() - newestTimestamp;
    return shouldBuildDecision(
      rows.map((row) => Number(row.status)),
      newestBuildAgeMs,
    );
  }

  /**
   * Packages whose builds fail often but not always: the intermittent ones
   * that waste builder time without ever showing up as permanently broken.
   * Only genuine attempts count.
   */
  getFlakiestPackages(options: { days: number }): Promise<FlakyPackageRow[]> {
    const days = clampInt(options.days, 1, MAX_DAYS_WINDOW);
    const failureFilter = 'COUNT(*) FILTER (WHERE build.status IN (:...failureStatuses))';
    const successFilter = 'COUNT(*) FILTER (WHERE build.status = :successStatus)';
    return this.buildRepository
      .createQueryBuilder('build')
      .select('pkg.pkgname AS pkgname')
      .addSelect('COUNT(*)::int AS attempts')
      .addSelect(`${failureFilter}::int AS failures`)
      .addSelect(`ROUND((${failureFilter})::numeric / COUNT(*), 4)::float8 AS flakiness`)
      .innerJoin('build.pkgbase', 'pkg')
      .where('pkg."isActive" = :isActive', { isActive: true })
      .andWhere('build.timestamp > :date', { date: nDaysInPast(days) })
      .andWhere('build.status IN (:...attempts)', { attempts: FLAKY_ATTEMPT_STATUSES })
      .groupBy('pkg.pkgname')
      .having(`COUNT(*) >= :minAttempts AND ${failureFilter} >= 1 AND ${successFilter} >= 1`, {
        minAttempts: MIN_FLAKINESS_ATTEMPTS,
      })
      .setParameter('failureStatuses', BUILD_FAILURE_STATUSES)
      .setParameter('successStatus', BuildStatus.SUCCESS)
      .orderBy('failures', 'DESC')
      .addOrderBy('attempts', 'DESC')
      .limit(MAX_AMOUNT)
      .cache(`flakiest-packages-${days}`, CACHE_TTL_MS)
      .getRawMany<FlakyPackageRow>();
  }

  /**
   * Builds per UTC hour-of-day per builder inside the window. Sparse: only
   * buckets with builds are returned, so the UI can render idle hours as empty.
   * Commits are counted distinctly: CI incidents requeue an already-built
   * commit many times, which would inflate buckets into the thousands.
   */
  getBuilderUtilization(options: { days: number }): Promise<BuilderUtilizationRow[]> {
    const days = clampInt(options.days, 1, MAX_DAYS_WINDOW);
    return this.buildRepository
      .createQueryBuilder('build')
      .select('builder.name AS builder')
      .addSelect(`EXTRACT(HOUR FROM build.timestamp AT TIME ZONE 'UTC')::int AS hour`)
      .addSelect('COUNT(DISTINCT build.commit)::int AS count')
      .innerJoin('build.builder', 'builder')
      .where('build.timestamp > :date', { date: nDaysInPast(days) })
      .groupBy('builder.name')
      .addGroupBy(`EXTRACT(HOUR FROM build.timestamp AT TIME ZONE 'UTC')`)
      .orderBy('builder', 'ASC')
      .addOrderBy('hour', 'ASC')
      .cache(`builder-utilization-${days}`, CACHE_TTL_MS)
      .getRawMany<BuilderUtilizationRow>();
  }

  getHeavyPackages(options: { amount: number; days: number }): Promise<{ pkgname: string; average: string }[]> {
    const amount = clampInt(options.amount, 1, MAX_AMOUNT);
    const days = clampInt(options.days, 1, MAX_DAYS_WINDOW);
    return this.buildRepository
      .createQueryBuilder('build')
      .select('pkg.pkgname AS pkgname')
      .addSelect('AVG(build.timeToEnd) AS average')
      .innerJoin('build.pkgbase', 'pkg')
      .where('build.timeToEnd IS NOT NULL')
      .andWhere('build.timestamp > :date', { date: nDaysInPast(days) })
      .groupBy('pkg.pkgname')
      .orderBy('average', 'DESC')
      .limit(amount)
      .cache(`heavy-packages-${amount}-${days}`, CACHE_TTL_MS)
      .getRawMany();
  }

  async getPackagesPerBuildClass(options: { days: number }): Promise<{ build_class: string; count: string }[]> {
    const days = clampInt(options.days, 1, MAX_DAYS_WINDOW);
    const rows = await this.buildRepository
      .createQueryBuilder('build')
      .select('build."buildClass" AS build_class')
      .addSelect('COUNT(DISTINCT pkg.id) AS count')
      .innerJoin('build.pkgbase', 'pkg')
      .where('build.status = :status', { status: BuildStatus.SUCCESS })
      .andWhere('build.timestamp > :date', { date: nDaysInPast(days) })
      .andWhere('build."buildClass" IS NOT NULL')
      .groupBy('build."buildClass"')
      .cache(`packages-per-build-class-${days}`, CACHE_TTL_MS)
      .getRawMany<{ build_class: string; count: string }>();
    return rows.sort((a, b) => buildClassSortKey(a.build_class) - buildClassSortKey(b.build_class));
  }

  async getSingleVsSplitPackages(): Promise<{ type: string; count: string }[]> {
    const row = await this.packageRepository
      .createQueryBuilder('package')
      .select(
        `COUNT(*) FILTER (WHERE package."pkgbaseName" IS NULL OR package."pkgbaseName" = package."pkgname") AS single`,
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE package."pkgbaseName" IS NOT NULL AND package."pkgbaseName" <> package."pkgname") AS split`,
      )
      .where('package.isActive = :isActive', { isActive: true })
      .cache('single-vs-split-packages', CACHE_TTL_MS)
      .getRawOne<{ single: string; split: string }>();
    return [
      { type: 'single', count: row?.single ?? '0' },
      { type: 'split', count: row?.split ?? '0' },
    ];
  }

  async getPackageResourceStatsPerDay(options: { pkgname: string; days: number }): Promise<PackageResourceDayRow[]> {
    const requestedPackage = await this.packageRepository.findOne({ where: { pkgname: options.pkgname } });
    if (!requestedPackage) {
      throw new NotFoundException('Package not found');
    }

    const days = clampInt(options.days, 1, MAX_DAYS_WINDOW);

    return this.buildRepository
      .createQueryBuilder('build')
      .select("DATE_TRUNC('day', build.timestamp AT TIME ZONE 'UTC') AS day")
      .addSelect(`AVG(${BUILD_RESOURCE_COLUMNS.avgMemory}) AS ${DAY_ROW_KEYS.avgMemory}`)
      .addSelect(`MAX(${BUILD_RESOURCE_COLUMNS.peakMemory}) AS ${DAY_ROW_KEYS.peakMemory}`)
      .addSelect(`AVG(${BUILD_RESOURCE_COLUMNS.cpuTime}) AS ${DAY_ROW_KEYS.cpuTime}`)
      .addSelect(
        `AVG(${BUILD_RESOURCE_COLUMNS.diskRead} + ${BUILD_RESOURCE_COLUMNS.diskWrite}) AS ${DAY_ROW_KEYS.diskIo}`,
      )
      .addSelect(
        `AVG(${BUILD_RESOURCE_COLUMNS.networkRx} + ${BUILD_RESOURCE_COLUMNS.networkTx}) AS ${DAY_ROW_KEYS.networkIo}`,
      )
      .addSelect('COUNT(*) AS samples')
      .innerJoin('build.pkgbase', 'pkgbase')
      .where('pkgbase.pkgname = :pkgname', { pkgname: options.pkgname })
      .andWhere(`${BUILD_RESOURCE_COLUMNS.sampleCount} IS NOT NULL`)
      .andWhere('build.timestamp > :date', { date: nDaysInPast(days) })
      .groupBy("DATE_TRUNC('day', build.timestamp AT TIME ZONE 'UTC')")
      .orderBy('day', 'DESC')
      .limit(days)
      .cache(`package-resource-stats-${options.pkgname}-${days}`, CACHE_TTL_MS)
      .getRawMany();
  }

  async getHeavyPackagesByResourceMetric(options: {
    metric: BuildResourceMetricKey;
    amount: number;
    days: number;
  }): Promise<{ pkgname: string; average: string }[]> {
    const amount = clampInt(options.amount, 1, MAX_AMOUNT);
    const days = clampInt(options.days, 1, MAX_DAYS_WINDOW);

    return this.buildRepository
      .createQueryBuilder('build')
      .select('pkg.pkgname AS pkgname')
      .addSelect(`${HEAVY_RESOURCE_METRIC_EXPRESSIONS[options.metric]} AS average`)
      .innerJoin('build.pkgbase', 'pkg')
      .where(`${BUILD_RESOURCE_COLUMNS.sampleCount} IS NOT NULL`)
      .andWhere('build.timestamp > :date', { date: nDaysInPast(days) })
      .groupBy('pkg.pkgname')
      .orderBy('average', 'DESC')
      .limit(amount)
      .cache(`heavy-packages-resource-${options.metric}-${amount}-${days}`, CACHE_TTL_MS)
      .getRawMany();
  }

  getThroughputPerDay(options: {
    days: number;
  }): Promise<{ day: string; success: string; alreadyBuilt: string; skipped: string; failed: string }[]> {
    const days = clampInt(options.days, 1, MAX_DAYS_WINDOW);
    return this.buildRepository
      .createQueryBuilder('build')
      .select("DATE_TRUNC('day', build.timestamp AT TIME ZONE 'UTC') AS day")
      .addSelect('COUNT(*) FILTER (WHERE build.status = :successStatus) AS success')
      .addSelect('COUNT(*) FILTER (WHERE build.status = :alreadyBuiltStatus) AS alreadyBuilt')
      .addSelect('COUNT(*) FILTER (WHERE build.status = :skippedStatus) AS skipped')
      .addSelect('COUNT(*) FILTER (WHERE build.status IN (:...failureStatuses)) AS failed')
      .groupBy('day')
      .orderBy('day', 'DESC')
      .limit(days)
      .setParameter('successStatus', BuildStatus.SUCCESS)
      .setParameter('alreadyBuiltStatus', BuildStatus.ALREADY_BUILT)
      .setParameter('skippedStatus', BuildStatus.SKIPPED)
      .setParameter('failureStatuses', BUILD_FAILURE_STATUSES)
      .cache(`throughput-per-day-${days}`, CACHE_TTL_MS)
      .getRawMany();
  }

  getBuildsPerPackage(options?: { days: number }): Promise<{ pkgbase: string; count: string }[]> {
    const days = options?.days ? clampInt(options.days, 1, MAX_DAYS_WINDOW) : undefined;
    const query = this.buildRepository
      .createQueryBuilder('build')
      .select('pkgbase.pkgname AS pkgbase')
      .addSelect('COUNT(*) AS count')
      .innerJoin('build.pkgbase', 'pkgbase')
      .groupBy('pkgbase.pkgname')
      .orderBy('count', 'DESC');

    if (days !== undefined) {
      query.where('build.timestamp > :date', { date: nDaysInPast(days) });
    }

    return query.cache(`builds-per-package-${days ?? 'all'}`, CACHE_TTL_MS).getRawMany();
  }

  async getAverageBuildTimePerStatus(days?: number): Promise<{ status: string; average_build_time: string }[]> {
    const query = this.buildRepository
      .createQueryBuilder('build')
      .select('AVG("timeToEnd") AS average_build_time')
      .addSelect('status')
      .where('"timeToEnd" IS NOT NULL')
      .groupBy('status')
      .orderBy('average_build_time', 'DESC');

    if (days !== undefined) {
      query.andWhere('build.timestamp > :date', { date: nDaysInPast(clampInt(days, 1, MAX_DAYS_WINDOW)) });
    }

    return query.cache(`average-build-time-per-status-${days ?? 'all'}`, CACHE_TTL_MS).getRawMany();
  }

  async getAverageBuildTimePerPackage(
    pkgnames: string[],
    days?: number,
  ): Promise<{ pkgname: string; average_build_time: string; samples: string }[]> {
    if (pkgnames.length === 0) return [];

    const query = this.buildRepository
      .createQueryBuilder('build')
      .select('pkgbase.pkgname AS pkgname')
      .addSelect('AVG("timeToEnd") AS average_build_time')
      .addSelect('COUNT(*) AS samples')
      .innerJoin('build.pkgbase', 'pkgbase')
      .where('pkgbase.pkgname IN (:...pkgnames)', { pkgnames })
      .andWhere('"timeToEnd" IS NOT NULL')
      .andWhere('build.status IN (:...statuses)', { statuses: [BuildStatus.SUCCESS, BuildStatus.FAILED] })
      .groupBy('pkgbase.pkgname')
      .orderBy('pkgname', 'ASC');

    if (days !== undefined) {
      query.andWhere('build.timestamp > :date', { date: nDaysInPast(clampInt(days, 1, MAX_DAYS_WINDOW)) });
    }

    return query.cache(`average-build-time-per-package-${pkgnames.join(',')}`, CACHE_TTL_MS).getRawMany();
  }

  async getLatestBuilds(options: {
    amount: number;
    offset: number;
  }): Promise<{ logUrl: string; commit: string; timeToEnd: string; pkgname: string; version: string }[]> {
    const amount = clampInt(options.amount ?? 100, 1, MAX_AMOUNT);
    const offset = clampInt(options.offset ?? 0, 0, MAX_OFFSET);
    return await this.buildRepository
      .createQueryBuilder('build')
      .select('b."logUrl"')
      .addSelect('b."commit"')
      .addSelect('b."timeToEnd"')
      .addSelect('p."pkgname"')
      .addSelect('p."version"')
      .from(Build, 'b')
      .innerJoin('b.pkgbase', 'p')
      .orderBy('b.timestamp', 'DESC')
      .addOrderBy('b.id', 'DESC')
      .limit(amount)
      .offset(offset)
      .cache(`latest-builds-${amount}-${offset}`, CACHE_TTL_MS)
      .getRawMany();
  }

  async getPackage(name: string, repo?: string) {
    const where = repo ? { pkgname: name, repo: { name: repo } } : { pkgname: name };
    // Only expose complete, current rows. Legacy leftovers (e.g. from before the
    // per-repo model) can have NULL version/pkgrel/metadata and must not be shown.
    const pkg = await this.packageRepository.findOne({
      where,
      order: { isActive: 'DESC' },
    });
    if (!pkg || !pkg.version || pkg.pkgrel === null || pkg.pkgrel === undefined || !pkg.metadata) {
      throw new NotFoundException(`Package not found: ${name}`);
    }
    return pkg;
  }
}
