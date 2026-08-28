import { cachedResult } from '../utils/cache';
import { HLL_LOG2M, MAX_DAYS_WINDOW, METRICS_CACHE_TTL_MS } from '../utils/constants';
import { clampInt, nDaysInPast, rejectedReasons, utcDayStart } from '../utils/functions';
import { RouterHitDailyAgent } from './router-hit-daily-agent.entity';
import { RouterHitDaily } from './router-hit-daily.entity';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { type Cache } from 'cache-manager';
import { DataSource } from 'typeorm';

/**
 * Router metrics are served from daily rollup tables rather than the raw hit
 * log. The raw rows are purged after a short retention window, so these tables
 * carry the long-lived history; a scheduled job keeps them current.
 */
@Injectable()
export class RouterService implements OnModuleInit {
  constructor(
    @InjectPinoLogger(RouterService.name) private readonly pino: PinoLogger,
    private dataSource: DataSource,
    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {
    this.pino.info('RouterService initialized');
  }

  async onModuleInit(): Promise<void> {
    void this.refreshDailyRollup().catch((err) => this.pino.error({ err }, 'Initial router rollup refresh failed'));
  }

  /** Recomputes the rollup for the most recent day(s) so history persists when raw hits are purged. */
  @Cron(CronExpression.EVERY_6_HOURS)
  async refreshDailyRollup(): Promise<void> {
    try {
      await this.dataSource.query(`
        INSERT INTO "router_hits_daily" ("day", "country", "hostname", "package", "repo", "count")
        SELECT
          DATE_TRUNC('day', "timestamp" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',
          "country",
          "hostname",
          "package",
          "repo",
          COUNT(*)::bigint
        FROM "router-hits"
        WHERE "timestamp" >= (SELECT COALESCE(MAX("day"), '-infinity'::timestamp) FROM "router_hits_daily")
        GROUP BY 1, 2, 3, 4, 5
        ON CONFLICT ("day", "country", "hostname", "package", "repo") DO UPDATE SET "count" = EXCLUDED."count"
      `);
      await this.dataSource.query(`
        INSERT INTO "router_hits_daily_agents" ("day", "package", "user_agent", "repo", "count")
        SELECT
          DATE_TRUNC('day', "timestamp" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',
          "package",
          COALESCE("user-agent", ''),
          "repo",
          COUNT(*)::bigint
        FROM "router-hits"
        WHERE "timestamp" >= (SELECT COALESCE(MAX("day"), '-infinity'::timestamp) FROM "router_hits_daily_agents")
        GROUP BY 1, 2, 3, 4
        ON CONFLICT ("day", "package", "user_agent", "repo") DO UPDATE SET "count" = EXCLUDED."count"
      `);
      await this.dataSource.query(`
        INSERT INTO "router_hits_daily_users" ("day", "sketch")
        SELECT
          DATE_TRUNC('day', "timestamp" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',
          hll_add_agg(hll_hash_text(ip::text), ${HLL_LOG2M})
        FROM "router-hits"
        WHERE "timestamp" >= (SELECT COALESCE(MAX("day"), '-infinity'::timestamp) FROM "router_hits_daily_users")
        GROUP BY 1
        ON CONFLICT ("day") DO UPDATE SET "sketch" = EXCLUDED."sketch"
      `);
      await this.warmAggregationCache();
      this.pino.info('Refreshed router hits daily rollup');
    } catch (err) {
      this.pino.error({ err }, 'Failed to refresh router hits daily rollup');
    }
  }

  /** Precomputes the common aggregation windows so requests never hit a cold cache. */
  private async warmAggregationCache(): Promise<void> {
    const windows = [7, 30, 90, MAX_DAYS_WINDOW];
    const results = await Promise.allSettled([
      ...windows.flatMap((days) => [
        this.getCountryStats(days),
        this.getMirrorStats(days),
        this.getPackageStats(days),
        this.getPerDayStats(days),
        this.getMirrorStatsOverTime(days),
        this.getCountryStatsOverTime(days),
        this.getUserAgentTrend(days),
      ]),
    ]);
    const failures = rejectedReasons(results);
    if (failures.length > 0) {
      this.pino.error(
        { failedCount: failures.length, totalCount: results.length, firstFailure: failures[0] },
        'Router aggregation cache warm-up failed for some queries',
      );
    }
  }

  async getCountryStats(days: number): Promise<{ country: string; count: string }[]> {
    const clampedDays = clampInt(days, 1, MAX_DAYS_WINDOW);
    return cachedResult(this.cache, `router:country:${clampedDays}`, METRICS_CACHE_TTL_MS, () =>
      this.dataSource
        .getRepository(RouterHitDaily)
        .createQueryBuilder('hit')
        .select('hit.country', 'country')
        .addSelect('SUM(hit.count)::text', 'count')
        .where('hit.day >= :cutoff', { cutoff: utcDayStart(nDaysInPast(clampedDays)) })
        .groupBy('hit.country')
        .orderBy('count', 'DESC')
        .getRawMany<{ country: string; count: string }>(),
    );
  }

  async getMirrorStats(days: number): Promise<{ mirror: string; count: string }[]> {
    const clampedDays = clampInt(days, 1, MAX_DAYS_WINDOW);
    return cachedResult(this.cache, `router:mirror:${clampedDays}`, METRICS_CACHE_TTL_MS, () =>
      this.dataSource
        .getRepository(RouterHitDaily)
        .createQueryBuilder('hit')
        .select('hit.hostname', 'mirror')
        .addSelect('SUM(hit.count)::text', 'count')
        .where('hit.day >= :cutoff', { cutoff: utcDayStart(nDaysInPast(clampedDays)) })
        .groupBy('hit.hostname')
        .orderBy('count', 'DESC')
        .getRawMany<{ mirror: string; count: string }>(),
    );
  }

  async getMirrorStatsOverTime(days: number, repo = ''): Promise<{ day: string; mirror: string; count: string }[]> {
    return this.getGroupedStatsOverTime(days, 'hit.hostname', 'mirror', repo);
  }

  async getCountryStatsOverTime(days: number, repo = ''): Promise<{ day: string; country: string; count: string }[]> {
    return this.getGroupedStatsOverTime(days, 'hit.country', 'country', repo);
  }

  /** Groups rollup rows by UTC day and one dimension, returning the count per day. */
  private getGroupedStatsOverTime<K extends string>(
    days: number,
    groupColumn: string,
    groupAlias: K,
    repo = '',
  ): Promise<({ day: string; count: string } & Record<K, string>)[]> {
    const clampedDays = clampInt(days, 1, MAX_DAYS_WINDOW);
    const key = `router:${groupAlias}-over-time:${clampedDays}:${repo}`;
    return cachedResult(this.cache, key, METRICS_CACHE_TTL_MS, () => {
      const query = this.dataSource
        .getRepository(RouterHitDaily)
        .createQueryBuilder('hit')
        .select(`TO_CHAR(hit.day, 'YYYY-MM-DD')`, 'day')
        .addSelect(groupColumn, groupAlias)
        .addSelect('SUM(hit.count)::text', 'count')
        .where('hit.day >= :cutoff', { cutoff: utcDayStart(nDaysInPast(clampedDays)) });
      if (repo) query.andWhere('hit.repo = :repo', { repo });
      return query
        .groupBy('hit.day')
        .addGroupBy(groupColumn)
        .orderBy('day', 'ASC')
        .getRawMany<{ day: string; count: string } & Record<K, string>>() as Promise<
        ({ day: string; count: string } & Record<K, string>)[]
      >;
    });
  }

  async getPackageStats(days: number): Promise<{ pkgbase: string; count: string }[]> {
    const clampedDays = clampInt(days, 1, MAX_DAYS_WINDOW);
    return cachedResult(this.cache, `router:package:${clampedDays}`, METRICS_CACHE_TTL_MS, () =>
      this.dataSource
        .getRepository(RouterHitDaily)
        .createQueryBuilder('hit')
        .select('hit.package', 'pkgbase')
        .addSelect('SUM(hit.count)::text', 'count')
        .where('hit.day >= :cutoff', { cutoff: utcDayStart(nDaysInPast(clampedDays)) })
        .groupBy('hit.package')
        .orderBy('count', 'DESC')
        .getRawMany<{ pkgbase: string; count: string }>(),
    );
  }

  async getPerDayStats(days: number): Promise<{ day: string; count: string }[]> {
    const clampedDays = clampInt(days, 1, MAX_DAYS_WINDOW);
    return cachedResult(this.cache, `router:per-day:${clampedDays}`, METRICS_CACHE_TTL_MS, () =>
      this.dataSource
        .getRepository(RouterHitDaily)
        .createQueryBuilder('hit')
        .select(`TO_CHAR(hit.day, 'YYYY-MM-DD')::text`, 'day')
        .addSelect('SUM(hit.count)::text', 'count')
        .where('hit.day >= :cutoff', { cutoff: utcDayStart(nDaysInPast(clampedDays)) })
        .groupBy('hit.day')
        .orderBy('count', 'DESC')
        .getRawMany<{ day: string; count: string }>(),
    );
  }

  async getUserAgentTrend(
    days: number,
    top = 5,
    repo = '',
  ): Promise<{ day: string; userAgent: string; count: string }[]> {
    const clampedDays = clampInt(days, 1, MAX_DAYS_WINDOW);
    return cachedResult(this.cache, `router:user-agents:${clampedDays}:${top}:${repo}`, METRICS_CACHE_TTL_MS, () =>
      this.queryUserAgentTrend(clampedDays, top, repo),
    );
  }

  private async queryUserAgentTrend(
    clampedDays: number,
    top: number,
    repo = '',
  ): Promise<{ day: string; userAgent: string; count: string }[]> {
    const agentRepository = this.dataSource.getRepository(RouterHitDailyAgent);
    const cutoff = utcDayStart(nDaysInPast(clampedDays));

    const topQuery = agentRepository
      .createQueryBuilder('hit')
      .select('hit.userAgent', 'ua')
      .addSelect('SUM(hit.count)', 'count')
      .where('hit.day >= :cutoff', { cutoff });
    if (repo) topQuery.andWhere('hit.repo = :repo', { repo });
    const topAgents = await topQuery
      .groupBy('hit.userAgent')
      .orderBy('count', 'DESC')
      .limit(top)
      .getRawMany<{ ua: string }>();

    const agents = topAgents.map((row) => row.ua);
    if (agents.length === 0) return [];

    const trendQuery = agentRepository
      .createQueryBuilder('hit')
      .select(`TO_CHAR(hit.day, 'YYYY-MM-DD')::text`, 'day')
      .addSelect('hit.userAgent', 'userAgent')
      .addSelect('SUM(hit.count)::text', 'count')
      .where('hit.day >= :cutoff', { cutoff })
      .andWhere('hit.userAgent IN (:...agents)', { agents });
    if (repo) trendQuery.andWhere('hit.repo = :repo', { repo });
    return trendQuery
      .groupBy('hit.day')
      .addGroupBy('hit.userAgent')
      .orderBy('day', 'ASC')
      .getRawMany<{ day: string; userAgent: string; count: string }>();
  }
}
