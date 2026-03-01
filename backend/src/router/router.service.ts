import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { nDaysInPast } from '../functions';

@Injectable()
export class RouterService {
  constructor(private dataSource: DataSource) {
    Logger.log('RouterService initialized', 'RouterService');
  }

  async getCountryStats(days: number): Promise<{ country: string; count: string }[]> {
    return this.dataSource.query(
      `SELECT country, COUNT(*)::text AS count FROM "router-hits" WHERE timestamp > $1 GROUP BY country ORDER BY COUNT(*) DESC`,
      [nDaysInPast(days)],
    );
  }

  async getMirrorStats(days: number): Promise<{ mirror: string; count: string }[]> {
    return this.dataSource.query(
      `SELECT hostname AS mirror, COUNT(*)::text AS count FROM "router-hits" WHERE timestamp > $1 GROUP BY hostname ORDER BY COUNT(*) DESC`,
      [nDaysInPast(days)],
    );
  }

  async getPackageStats(days: number): Promise<{ pkgbase: string; count: string }[]> {
    return this.dataSource.query(
      `SELECT package AS pkgbase, COUNT(*)::text AS count FROM "router-hits" WHERE timestamp > $1 GROUP BY package ORDER BY COUNT(*) DESC`,
      [nDaysInPast(days)],
    );
  }

  async getPerDayStats(days: number): Promise<{ day: string; count: string }[]> {
    return this.dataSource.query(
      `SELECT DATE(timestamp) AS day, COUNT(*)::text AS count FROM "router-hits" WHERE timestamp > $1 GROUP BY DATE(timestamp) ORDER BY COUNT(*) DESC`,
      [nDaysInPast(days)],
    );
  }
}
