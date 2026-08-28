import { RouterHitDailyAgent } from '../router/router-hit-daily-agent.entity';
import { RouterHitDaily } from '../router/router-hit-daily.entity';
import { cachedResult } from '../utils/cache';
import { CACHE_TTL_MS, MAX_DAYS_WINDOW, METRICS_CACHE_TTL_MS } from '../utils/constants';
import { clampInt, errorMessage, nDaysInPast, rejectedReasons, utcDayStart } from '../utils/functions';
import {
  LIVE_RPS_SSE_EVENT,
  type CountNameObject,
  type LiveRouterRps,
  type LiveTrafficHit,
  type RpsHistorySample,
  type SpecificPackageMetrics,
  type UserAgentList,
} from '@chaotic-next/shared-lib';
import { HttpService } from '@nestjs/axios';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { type Cache } from 'cache-manager';
import { createInterface } from 'node:readline';
import { merge, Observable, share } from 'rxjs';
import { DataSource } from 'typeorm';

let hitCounter = 0;

const METRICS_UPSTREAM_BASE_URL = 'https://metrics.chaotic.cx';

export function parseTrafficLine(line: string): LiveTrafficHit | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Format: timestamp|(CC) hash|repo|status|||||userAgent|hostname|worker
  const parts = trimmed.split('|');
  if (parts.length < 4) return null;

  const timestamp = Number(parts[0]) || Date.now();
  const clientMatch = parts[1]?.match(/\(([^)]+)\)\s*([a-zA-Z0-9_-]+)/);
  const countryCode = clientMatch ? clientMatch[1].toUpperCase() : 'UNKNOWN';
  const userHash = clientMatch ? clientMatch[2] : (parts[1] ?? '');
  const repo = parts[2] || 'chaotic-aur';
  const statusCode = Number(parts[3]) || 200;
  const userAgent = parts[8] || 'Unknown';
  const hostname = parts[9] || 'geo-mirror.chaotic.cx';
  const worker = parts[10] || 'web.1';

  hitCounter++;
  return {
    id: `${timestamp}-${hitCounter}`,
    timestamp,
    countryCode,
    userHash,
    repo,
    statusCode,
    userAgent,
    hostname,
    worker,
  };
}

const PKGNAME_REGEX = /^[a-zA-Z0-9.@+_-]{1,255}$/;

export function parseRpsLine(line: string): LiveRouterRps | null {
  const match = line.trim().match(/^data:\s*(\d+)$/);
  if (!match) return null;
  return { rps: Number(match[1]) };
}

function assertPackageName(name: string): string {
  if (!PKGNAME_REGEX.test(name)) {
    throw new BadRequestException(`Invalid package name: ${name}`, { errorCode: 'INVALID_PKGNAME' });
  }
  return name;
}

function assertRankRange(range: string): number {
  if (!/^\d+$/.test(range)) {
    throw new BadRequestException(`Invalid rank range: ${range}`, { errorCode: 'INVALID_RANK_RANGE' });
  }
  const parsed = Number.parseInt(range, 10);
  if (parsed < 1 || parsed > 200) {
    throw new BadRequestException('Rank range must be between 1 and 200', { errorCode: 'INVALID_RANK_RANGE' });
  }
  return parsed;
}

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);

  constructor(
    private dataSource: DataSource,
    @Inject(CACHE_MANAGER) private cache: Cache,
    private readonly httpService: HttpService,
  ) {
    this.logger.log('MetricsService initialized');
  }

  /** Precomputes the common windows so requests never hit a cold cache. */
  @Cron(CronExpression.EVERY_6_HOURS)
  async warmMetricsCache(): Promise<void> {
    const windows = [7, 30, 90, MAX_DAYS_WINDOW];
    const startedAtMs = Date.now();
    const results = await Promise.allSettled([
      ...windows.flatMap((days) => [
        this.uniqueUsers(days),
        this.uniqueUserAgents(days),
        this.rankCountries('10', days),
        this.rankCountries('30', days),
        this.rankPackages('10', days),
        this.rankPackages('30', days),
        this.rankPackages('100', days),
      ]),
    ]);
    const failures = rejectedReasons(results);
    if (failures.length > 0) {
      this.logger.error(
        `Metrics cache warm-up failed for ${failures.length} of ${results.length} queries, ` +
          `first failure: ${errorMessage(failures[0])}`,
      );
    }
    this.logger.log(`Warmed metrics cache in ${Date.now() - startedAtMs}ms`);
  }

  /**
   * Get the unique user (IP) count from the daily HyperLogLog sketches. The
   * sketches survive raw-log purges, so history is preserved for any window.
   * @param days The number of days to look back (defaults to 30)
   * @returns The unique user count
   */
  async uniqueUsers(days = 30): Promise<number> {
    const clampedDays = clampInt(days, 1, MAX_DAYS_WINDOW);
    return cachedResult(
      this.cache,
      `metrics:users:${clampedDays}`,
      METRICS_CACHE_TTL_MS,
      () =>
        this.dataSource.query(
          `SELECT ROUND(hll_cardinality(hll_union_agg(sketch)))::int AS count
         FROM "router_hits_daily_users"
         WHERE "day" >= $1`,
          [utcDayStart(nDaysInPast(clampedDays))],
        ) as Promise<{ count: number }[]>,
    ).then((rows) => rows[0]?.count ?? 0);
  }

  /**
   * Get the user agent list from the daily agent rollup.
   * @param days The number of days to look back (defaults to 30)
   * @returns The user agent list with counts
   */
  async uniqueUserAgents(days = 30, repo = ''): Promise<UserAgentList> {
    const clampedDays = clampInt(days, 1, MAX_DAYS_WINDOW);
    return cachedResult(this.cache, `metrics:user-agents:${clampedDays}:${repo}`, METRICS_CACHE_TTL_MS, () => {
      const query = this.dataSource
        .getRepository(RouterHitDailyAgent)
        .createQueryBuilder('hit')
        .select('hit.userAgent', 'name')
        .addSelect('SUM(hit.count)::int', 'count')
        .where('hit.day >= :cutoff', { cutoff: utcDayStart(nDaysInPast(clampedDays)) });
      if (repo) query.andWhere('hit.repo = :repo', { repo });
      return query.groupBy('hit.userAgent').orderBy('count', 'DESC').getRawMany<UserAgentList[number]>();
    });
  }

  async packageMetrics(param: string, days = 30): Promise<SpecificPackageMetrics> {
    const pkgname = assertPackageName(param);
    const clampedDays = clampInt(days, 1, MAX_DAYS_WINDOW);
    return cachedResult(this.cache, `metrics:package:${pkgname}:${clampedDays}`, METRICS_CACHE_TTL_MS, () =>
      this.queryPackageMetrics(pkgname, clampedDays),
    );
  }

  private async queryPackageMetrics(pkgname: string, clampedDays: number): Promise<SpecificPackageMetrics> {
    const cutoff = utcDayStart(nDaysInPast(clampedDays));

    const downloadRow = await this.dataSource
      .getRepository(RouterHitDaily)
      .createQueryBuilder('hit')
      .select('SUM(hit.count)::int', 'count')
      .where('hit.day >= :cutoff', { cutoff })
      .andWhere('hit.package = :pkg', { pkg: pkgname })
      .getRawOne<{ count: number }>();
    const userAgentRows = await this.dataSource
      .getRepository(RouterHitDailyAgent)
      .createQueryBuilder('hit')
      .select('hit.userAgent', 'name')
      .addSelect('SUM(hit.count)::int', 'count')
      .where('hit.day >= :cutoff', { cutoff })
      .andWhere('hit.package = :pkg', { pkg: pkgname })
      .groupBy('hit.userAgent')
      .orderBy('count', 'DESC')
      .getRawMany<UserAgentList[number]>();

    return {
      name: pkgname,
      downloads: downloadRow?.count ?? 0,
      user_agents: userAgentRows,
    };
  }

  async rankCountries(range: string, days = 30, repo = ''): Promise<CountNameObject[]> {
    const rankRange = assertRankRange(range);
    const clampedDays = clampInt(days, 1, MAX_DAYS_WINDOW);
    return cachedResult(
      this.cache,
      `metrics:rank-countries:${rankRange}:${clampedDays}:${repo}`,
      METRICS_CACHE_TTL_MS,
      () => {
        const query = this.dataSource
          .getRepository(RouterHitDaily)
          .createQueryBuilder('hit')
          .select('hit.country', 'name')
          .addSelect('SUM(hit.count)::int', 'count')
          .where('hit.day >= :cutoff', { cutoff: utcDayStart(nDaysInPast(clampedDays)) });
        if (repo) query.andWhere('hit.repo = :repo', { repo });
        return query.groupBy('hit.country').orderBy('count', 'DESC').limit(rankRange).getRawMany<CountNameObject>();
      },
    );
  }

  async rankPackages(range: string, days = 30, repo = ''): Promise<CountNameObject[]> {
    const rankRange = assertRankRange(range);
    const clampedDays = clampInt(days, 1, MAX_DAYS_WINDOW);
    return cachedResult(
      this.cache,
      `metrics:rank-packages:${rankRange}:${clampedDays}:${repo}`,
      METRICS_CACHE_TTL_MS,
      () => {
        const query = this.dataSource
          .getRepository(RouterHitDaily)
          .createQueryBuilder('hit')
          .select('hit.package', 'name')
          .addSelect('SUM(hit.count)::int', 'count')
          .where('hit.day >= :cutoff', { cutoff: utcDayStart(nDaysInPast(clampedDays)) });
        if (repo) query.andWhere('hit.repo = :repo', { repo });
        return query.groupBy('hit.package').orderBy('count', 'DESC').limit(rankRange).getRawMany<CountNameObject>();
      },
    );
  }

  private upstreamSse<T>(
    path: string,
    parseLine: (line: string) => T | null,
    eventType?: string,
  ): Observable<Partial<MessageEvent<T>>> {
    return new Observable<Partial<MessageEvent<T>>>((subscriber) => {
      const abortController = new AbortController();

      (async () => {
        try {
          const upstream = await this.httpService.axiosRef({
            method: 'GET',
            url: `${METRICS_UPSTREAM_BASE_URL}/${path}`,
            responseType: 'stream',
            signal: abortController.signal,
          });

          const rl = createInterface({
            input: upstream.data,
            crlfDelay: Infinity,
          });

          rl.on('line', (line: string) => {
            const parsed = parseLine(line);
            if (parsed) {
              subscriber.next({ data: parsed, type: eventType } as Partial<MessageEvent<T>>);
            }
          });

          rl.on('close', () => {
            subscriber.complete();
          });

          rl.on('error', (err) => {
            subscriber.error(err);
          });
        } catch (err) {
          subscriber.error(err);
        }
      })();

      return () => {
        abortController.abort();
      };
    });
  }

  /**
   * One shared upstream connection pair (traffic + RPS). Drops once last subscriber disconnects.
   */
  private readonly liveTraffic$ = merge(
    this.upstreamSse('live/traffic', parseTrafficLine),
    this.upstreamSse('live/rps', parseRpsLine, LIVE_RPS_SSE_EVENT),
  ).pipe(share());

  getLiveTrafficStream(): Observable<Partial<MessageEvent<LiveTrafficHit | LiveRouterRps>>> {
    return this.liveTraffic$;
  }

  /** Proxies the router's per-second RPS history of the last hour; the
   * upstream does not send CORS headers, so browsers cannot call it directly. */
  getRpsHistory(): Promise<RpsHistorySample[]> {
    return cachedResult(this.cache, 'metrics:rps-history', CACHE_TTL_MS, async () => {
      const response = await this.httpService.axiosRef.get<RpsHistorySample[]>(
        `${METRICS_UPSTREAM_BASE_URL}/rps/history`,
      );
      return response.data;
    });
  }
}
