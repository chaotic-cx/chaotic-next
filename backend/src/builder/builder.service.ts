import type { Package as PackageDto, Paginated } from '@chaotic-next/shared-lib';
import { Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import IORedis from 'ioredis';
import { ServiceBroker } from 'moleculer';
import { Repository } from 'typeorm';
import { EventService } from '../events/event.service';
import { GitlabService } from '../gitlab/gitlab.service';
import { RepoManagerService } from '../repo-manager/repo-manager.service';
import { BuildStatus } from '../types/types';
import { CACHE_TTL_MS, MAX_AMOUNT, MAX_DAYS_PER_DAY_CHART, MAX_DAYS_WINDOW, MAX_OFFSET } from '../utils/constants';
import { clampInt, errorMessage, generateNodeId, nDaysInPast, whitelistSort } from '../utils/functions';
import { paginate, resolveOrder, resolvePagination } from '../utils/pagination';
import { BuilderDatabaseService } from './builder-database.service';
import { Build, Builder, Package, Repo } from './builder.entity';
import { brokerConfig } from './moleculer.config';

@Injectable()
export class BuilderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BuilderService.name);
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
    private configService: ConfigService,
    private eventService: EventService,
    private repoManagerService: RepoManagerService,
    private gitlabService: GitlabService,
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
          this.logger.error(`Redis connection error: ${err.message}`);
        }
      });
      this.connection = connection;
    } catch (err: unknown) {
      this.logger.error(err);
    }
  }

  onModuleInit() {
    // Fire-and-forget: don't block startup on broker connection/registration.
    void this.initBroker().catch((err: unknown) => {
      this.logger.error(`Broker init failed: ${errorMessage(err)}`);
    });
  }

  async initBroker() {
    if (!this.connection) {
      this.logger.error('Broker init skipped: Redis connection could not be established');
      return;
    }
    const dbConnections = {
      build: this.buildRepository,
      builder: this.builderRepository,
      package: this.packageRepository,
      repo: this.repoRepository,
    };

    try {
      await this.connection.connect();

      this.broker = new ServiceBroker(brokerConfig(generateNodeId(), this.connection));
      this.broker.createService(
        new BuilderDatabaseService({
          broker: this.broker,
          dbConnections,
          repoManagerService: this.repoManagerService,
          sseSubject: this.eventService.sseEvents$,
          gitlabService: this.gitlabService,
        }),
      );
      await this.broker.start();
    } catch (err: unknown) {
      this.logger.error(err);
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

    query.orderBy(this.buildSortExpression(options.sort), resolveOrder(options.order));

    const [items, total] = await query.skip(skip).take(perPage).getManyAndCount();
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

  getFailedBuildHotspots(options: { amount: number }): Promise<{ pkgname: string; count: string }[]> {
    const amount = clampInt(options.amount, 1, MAX_AMOUNT);
    return this.buildRepository
      .createQueryBuilder('build')
      .select('pkg.pkgname AS pkgname')
      .addSelect('COUNT(*) AS count')
      .innerJoin('build.pkgbase', 'pkg')
      .where('build.status::text IN (:...failures)', {
        failures: [String(BuildStatus.FAILED), String(BuildStatus.TIMED_OUT), String(BuildStatus.SOFTWARE_FAILURE)],
      })
      .groupBy('pkg.pkgname')
      .orderBy('count', 'DESC')
      .limit(amount)
      .cache(`failed-build-hotspots-${amount}`, CACHE_TTL_MS)
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
    const failures = [String(BuildStatus.FAILED), String(BuildStatus.TIMED_OUT), String(BuildStatus.SOFTWARE_FAILURE)];

    const top = await this.buildRepository
      .createQueryBuilder('build')
      .select('pkg.pkgname AS pkgname')
      .innerJoin('build.pkgbase', 'pkg')
      .where('build.status::text IN (:...failures)', { failures })
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
      .where('build.status::text IN (:...failures)', { failures })
      .andWhere('build.timestamp > :date', { date })
      .andWhere('pkg.pkgname IN (:...pkgnames)', { pkgnames })
      .groupBy('day')
      .addGroupBy('pkg.pkgname')
      .orderBy('day', 'DESC')
      .cache(`failed-builds-over-time-${amount}-${days}`, CACHE_TTL_MS)
      .getRawMany<{ day: string; pkgname: string; count: string }>();
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

  getThroughputPerDay(options: {
    days: number;
  }): Promise<{ day: string; success: string; alreadyBuilt: string; skipped: string; failed: string }[]> {
    const days = clampInt(options.days, 1, MAX_DAYS_WINDOW);
    const failedStatuses = [
      String(BuildStatus.FAILED),
      String(BuildStatus.TIMED_OUT),
      String(BuildStatus.SOFTWARE_FAILURE),
    ];
    return this.buildRepository
      .createQueryBuilder('build')
      .select("DATE_TRUNC('day', build.timestamp AT TIME ZONE 'UTC') AS day")
      .addSelect(`COUNT(*) FILTER (WHERE build.status::text = '${BuildStatus.SUCCESS}') AS success`)
      .addSelect(`COUNT(*) FILTER (WHERE build.status::text = '${BuildStatus.ALREADY_BUILT}') AS alreadyBuilt`)
      .addSelect(`COUNT(*) FILTER (WHERE build.status::text = '${BuildStatus.SKIPPED}') AS skipped`)
      .addSelect(`COUNT(*) FILTER (WHERE build.status::text IN ('${failedStatuses.join("','")}')) AS failed`)
      .groupBy('day')
      .orderBy('day', 'DESC')
      .limit(days)
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
      .orderBy('p."lastUpdated"', 'DESC')
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
