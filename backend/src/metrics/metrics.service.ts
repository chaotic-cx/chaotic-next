import { type CountNameObject, type SpecificPackageMetrics, type UserAgentList } from '@chaotic-next/shared-lib';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { clampInt, nDaysInPast } from '../utils/functions';
import { MAX_DAYS_WINDOW } from '../utils/constants';
import { DataSource } from 'typeorm';
import { RouterHit } from '../router/router-hit.entity';

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

  constructor(private dataSource: DataSource) {
    this.logger.log('MetricsService initialized');
  }

  /**
   * Get the unique user (IP) count from the router-hits table.
   * @param days The number of days to look back (defaults to 30)
   * @returns The unique user count
   */
  async uniqueUsers(days = 30): Promise<number> {
    const clampedDays = clampInt(days, 1, MAX_DAYS_WINDOW);
    const row = await this.dataSource
      .getRepository(RouterHit)
      .createQueryBuilder('hit')
      .select('COUNT(DISTINCT hit.ip)::int', 'count')
      .where('hit.timestamp > :cutoff', { cutoff: nDaysInPast(clampedDays) })
      .getRawOne<{ count: number }>();
    return row?.count ?? 0;
  }

  /**
   * Get the user agent list from the router-hits table.
   * @param days The number of days to look back (defaults to 30)
   * @returns The user agent list with counts
   */
  async uniqueUserAgents(days = 30): Promise<UserAgentList> {
    const clampedDays = clampInt(days, 1, MAX_DAYS_WINDOW);
    return this.dataSource
      .getRepository(RouterHit)
      .createQueryBuilder('hit')
      .select('hit.userAgent', 'name')
      .addSelect('COUNT(*)::int', 'count')
      .where('hit.timestamp > :cutoff', { cutoff: nDaysInPast(clampedDays) })
      .groupBy('hit.userAgent')
      .orderBy('count', 'DESC')
      .getRawMany<UserAgentList[number]>();
  }

  async packageMetrics(param: string, days = 30): Promise<SpecificPackageMetrics> {
    const pkgname = assertPackageName(param);
    const clampedDays = clampInt(days, 1, MAX_DAYS_WINDOW);
    const cutoff = nDaysInPast(clampedDays);

    const repo = this.dataSource.getRepository(RouterHit);
    const downloadRow = await repo
      .createQueryBuilder('hit')
      .select('COUNT(*)::int', 'count')
      .where('hit.timestamp > :cutoff', { cutoff })
      .andWhere('hit.package = :pkg', { pkg: pkgname })
      .getRawOne<{ count: number }>();
    const userAgentRows = await repo
      .createQueryBuilder('hit')
      .select('hit.userAgent', 'name')
      .addSelect('COUNT(*)::int', 'count')
      .where('hit.timestamp > :cutoff', { cutoff })
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
    return this.dataSource
      .getRepository(RouterHit)
      .createQueryBuilder('hit')
      .select('hit.country', 'name')
      .addSelect('COUNT(*)::int', 'count')
      .where('hit.timestamp > :cutoff', { cutoff: nDaysInPast(clampedDays) })
      .groupBy('hit.country')
      .orderBy('count', 'DESC')
      .limit(rankRange)
      .getRawMany<CountNameObject>();
  }

  async rankPackages(range: string, days = 30): Promise<CountNameObject[]> {
    const rankRange = assertRankRange(range);
    const clampedDays = clampInt(days, 1, MAX_DAYS_WINDOW);
    return this.dataSource
      .getRepository(RouterHit)
      .createQueryBuilder('hit')
      .select('hit.package', 'name')
      .addSelect('COUNT(*)::int', 'count')
      .where('hit.timestamp > :cutoff', { cutoff: nDaysInPast(clampedDays) })
      .groupBy('hit.package')
      .orderBy('count', 'DESC')
      .limit(rankRange)
      .getRawMany<CountNameObject>();
  }
}
