import { Injectable, Logger } from '@nestjs/common';
import { clampInt, nDaysInPast } from '../utils/functions';
import { MAX_DAYS_WINDOW } from '../utils/constants';
import { DataSource } from 'typeorm';
import { RouterHit } from './router-hit.entity';

@Injectable()
export class RouterService {
  private readonly logger = new Logger(RouterService.name);

  constructor(private dataSource: DataSource) {
    this.logger.log('RouterService initialized');
  }

  async getCountryStats(days: number): Promise<{ country: string; count: string }[]> {
    const clampedDays = clampInt(days, 1, MAX_DAYS_WINDOW);
    return this.dataSource
      .getRepository(RouterHit)
      .createQueryBuilder('hit')
      .select('hit.country', 'country')
      .addSelect('COUNT(*)::text', 'count')
      .where('hit.timestamp > :cutoff', { cutoff: nDaysInPast(clampedDays) })
      .groupBy('hit.country')
      .orderBy('count', 'DESC')
      .getRawMany<{ country: string; count: string }>();
  }

  async getMirrorStats(days: number): Promise<{ mirror: string; count: string }[]> {
    const clampedDays = clampInt(days, 1, MAX_DAYS_WINDOW);
    return this.dataSource
      .getRepository(RouterHit)
      .createQueryBuilder('hit')
      .select('hit.hostname', 'mirror')
      .addSelect('COUNT(*)::text', 'count')
      .where('hit.timestamp > :cutoff', { cutoff: nDaysInPast(clampedDays) })
      .groupBy('hit.hostname')
      .orderBy('count', 'DESC')
      .getRawMany<{ mirror: string; count: string }>();
  }

  async getPackageStats(days: number): Promise<{ pkgbase: string; count: string }[]> {
    const clampedDays = clampInt(days, 1, MAX_DAYS_WINDOW);
    return this.dataSource
      .getRepository(RouterHit)
      .createQueryBuilder('hit')
      .select('hit.package', 'pkgbase')
      .addSelect('COUNT(*)::text', 'count')
      .where('hit.timestamp > :cutoff', { cutoff: nDaysInPast(clampedDays) })
      .groupBy('hit.package')
      .orderBy('count', 'DESC')
      .getRawMany<{ pkgbase: string; count: string }>();
  }

  async getPerDayStats(days: number): Promise<{ day: string; count: string }[]> {
    const clampedDays = clampInt(days, 1, MAX_DAYS_WINDOW);
    return this.dataSource
      .getRepository(RouterHit)
      .createQueryBuilder('hit')
      .select('DATE(hit.timestamp)::text', 'day')
      .addSelect('COUNT(*)::text', 'count')
      .where('hit.timestamp > :cutoff', { cutoff: nDaysInPast(clampedDays) })
      .groupBy('DATE(hit.timestamp)')
      .orderBy('count', 'DESC')
      .getRawMany<{ day: string; count: string }>();
  }

  async getUserAgentTrend(days: number, top = 5): Promise<{ day: string; userAgent: string; count: string }[]> {
    const clampedDays = clampInt(days, 1, MAX_DAYS_WINDOW);
    const repo = this.dataSource.getRepository(RouterHit);
    const cutoff = nDaysInPast(clampedDays);

    const topAgents = await repo
      .createQueryBuilder('hit')
      .select('hit."user-agent"', 'ua')
      .addSelect('COUNT(*)', 'count')
      .where('hit.timestamp > :cutoff', { cutoff })
      .andWhere('hit."user-agent" IS NOT NULL')
      .groupBy('hit."user-agent"')
      .orderBy('count', 'DESC')
      .limit(top)
      .getRawMany<{ ua: string }>();

    const agents = topAgents.map((row) => row.ua);
    if (agents.length === 0) return [];

    return repo
      .createQueryBuilder('hit')
      .select('DATE(hit.timestamp)::text', 'day')
      .addSelect('hit."user-agent"', 'userAgent')
      .addSelect('COUNT(*)::text', 'count')
      .where('hit.timestamp > :cutoff', { cutoff })
      .andWhere('hit."user-agent" IN (:...agents)', { agents })
      .groupBy('DATE(hit.timestamp)')
      .addGroupBy('hit."user-agent"')
      .orderBy('DATE(hit.timestamp)', 'ASC')
      .getRawMany<{ day: string; userAgent: string; count: string }>();
  }
}
