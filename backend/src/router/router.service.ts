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
}
