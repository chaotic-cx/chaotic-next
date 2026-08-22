import * as readline from 'node:readline';
import {
  type CountNameObject,
  type LiveTrafficHit,
  type SpecificPackageMetrics,
  type UserAgentList,
} from '@chaotic-next/shared-lib';
import { HttpService } from '@nestjs/axios';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Cache } from 'cache-manager';
import { Observable } from 'rxjs';
import { clampInt, nDaysInPast, utcDayStart } from '../utils/functions';
import { MAX_DAYS_WINDOW, METRICS_CACHE_TTL_MS } from '../utils/constants';
import { cachedResult } from '../utils/cache';
import { DataSource } from 'typeorm';
import { RouterHitDailyAgent } from '../router/router-hit-daily-agent.entity';
import { RouterHitDaily } from '../router/router-hit-daily.entity';

let hitCounter = 0;

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

function assertPackageName(name: string): string {
  if (!PKGNAME_REGEX.test(name)) {
    throw new BadRequestException(`Invalid package name: ${name}`);
  }
  return name;
}

function assertRankRange(range: string): number {
  if (!/^\d+$/.test(range)) {
    throw new BadRequestException(`Invalid rank range: ${range}`);
  }
  const parsed = Number.parseInt(range, 10);
  if (parsed < 1 || parsed > 200) {
    throw new BadRequestException('Rank range must be between 1 and 200');
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
    await Promise.allSettled([
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
        ) as Promise<Array<{ count: number }>>,
    ).then((rows) => rows[0]?.count ?? 0);
  }

  /**
   * Get the user agent list from the daily agent rollup.
   * @param days The number of days to look back (defaults to 30)
   * @returns The user agent list with counts
   */
  async uniqueUserAgents(days = 30): Promise<UserAgentList> {
    const clampedDays = clampInt(days, 1, MAX_DAYS_WINDOW);
    return cachedResult(this.cache, `metrics:user-agents:${clampedDays}`, METRICS_CACHE_TTL_MS, () =>
      this.dataSource
        .getRepository(RouterHitDailyAgent)
        .createQueryBuilder('hit')
        .select('hit.userAgent', 'name')
        .addSelect('SUM(hit.count)::int', 'count')
        .where('hit.day >= :cutoff', { cutoff: utcDayStart(nDaysInPast(clampedDays)) })
        .groupBy('hit.userAgent')
        .orderBy('count', 'DESC')
        .getRawMany<UserAgentList[number]>(),
    );
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

  async rankCountries(range: string, days = 30): Promise<CountNameObject[]> {
    const rankRange = assertRankRange(range);
    const clampedDays = clampInt(days, 1, MAX_DAYS_WINDOW);
    return cachedResult(this.cache, `metrics:rank-countries:${rankRange}:${clampedDays}`, METRICS_CACHE_TTL_MS, () =>
      this.dataSource
        .getRepository(RouterHitDaily)
        .createQueryBuilder('hit')
        .select('hit.country', 'name')
        .addSelect('SUM(hit.count)::int', 'count')
        .where('hit.day >= :cutoff', { cutoff: utcDayStart(nDaysInPast(clampedDays)) })
        .groupBy('hit.country')
        .orderBy('count', 'DESC')
        .limit(rankRange)
        .getRawMany<CountNameObject>(),
    );
  }

  async rankPackages(range: string, days = 30): Promise<CountNameObject[]> {
    const rankRange = assertRankRange(range);
    const clampedDays = clampInt(days, 1, MAX_DAYS_WINDOW);
    return cachedResult(this.cache, `metrics:rank-packages:${rankRange}:${clampedDays}`, METRICS_CACHE_TTL_MS, () =>
      this.dataSource
        .getRepository(RouterHitDaily)
        .createQueryBuilder('hit')
        .select('hit.package', 'name')
        .addSelect('SUM(hit.count)::int', 'count')
        .where('hit.day >= :cutoff', { cutoff: utcDayStart(nDaysInPast(clampedDays)) })
        .groupBy('hit.package')
        .orderBy('count', 'DESC')
        .limit(rankRange)
        .getRawMany<CountNameObject>(),
    );
  }

  getLiveTrafficStream(): Observable<MessageEvent<LiveTrafficHit>> {
    return new Observable<MessageEvent<LiveTrafficHit>>((subscriber) => {
      const abortController = new AbortController();

      (async () => {
        try {
          const upstream = await this.httpService.axiosRef({
            method: 'GET',
            url: 'https://metrics.chaotic.cx/live/traffic',
            responseType: 'stream',
            signal: abortController.signal,
          });

          const rl = readline.createInterface({
            input: upstream.data,
            crlfDelay: Infinity,
          });

          rl.on('line', (line: string) => {
            const hit = parseTrafficLine(line);
            if (hit) {
              subscriber.next({ data: hit } as MessageEvent<LiveTrafficHit>);
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
}
