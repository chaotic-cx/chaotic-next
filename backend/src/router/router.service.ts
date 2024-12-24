import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { Package, pkgnameExists, Repo, repoExists } from '../builder/builder.entity';
import { nDaysInPast } from '../functions';
import type { RouterHitBody } from '../types';
import { Mirror, mirrorExists, RouterHit, type RouterHitColumns } from './router.entity';

@Injectable()
export class RouterService {
  constructor(
    @InjectRepository(RouterHit)
    private routerRitRepo: Repository<RouterHit>,
    @InjectRepository(Package)
    private packageRepo: Repository<Package>,
    @InjectRepository(Repo)
    private repoRepo: Repository<Repo>,
    @InjectRepository(Mirror)
    private mirrorRepo: Repository<Mirror>,
  ) {
    Logger.log('RouterService initialized', 'RouterService');
  }

  /**
   * Save a router request to the database.
   * @param body The request body containing at least repo and package properties
   */
  async hitRouter(body: RouterHitBody): Promise<void> {
    if ((body.repo || body.package) === undefined) {
      throw new BadRequestException('Missing required fields, throwing entry away');
    }

    const relations: [Package, Repo, Mirror] = await Promise.all([
      await pkgnameExists(body.package, this.packageRepo),
      await repoExists(body.repo, this.repoRepo),
      await mirrorExists(body.hostname, this.mirrorRepo),
    ]);

    if (relations.includes(null)) {
      throw new BadRequestException('Invalid relations, throwing entry away');
    }

    const toSave: Partial<RouterHit> = {
      country: body.country,
      hostname: relations[2],
      ip: body.ip,
      pkgbase: relations[0],
      repo: relations[1],
      repo_arch: body.repo_arch,
      timestamp: new Date(Number(body.timestamp) * 1000).toISOString(),
      user_agent: body.user_agent,
      version: `${body.version}-${body.pkgrel}`,
    };

    void this.routerRitRepo.save(toSave);
  }

  /**
   * Get the general stats for the last x days.
   * @param days The number of days to look back
   * @param type The column to select
   */
  getGeneralStats(days: number, type: RouterHitColumns): Promise<RouterHit[]> {
    return this.routerRitRepo
      .createQueryBuilder('router_hit')
      .select(`router_hit.${type}`)
      .where('router_hit.timestamp > :date', { date: nDaysInPast(days) })
      .cache(true)
      .getMany();
  }

  /**
   * Get the number of hits per country for the last x days.
   * @param days The number of days to look back
   * @returns An array of objects containing the country name and the number of hits
   */
  getCountryStats(days: number): Promise<{ country: string; count: number }[]> {
    return this.routerRitRepo
      .createQueryBuilder('router_hit')
      .select('router_hit.country AS country')
      .addSelect('COUNT(router_hit.country)', 'count')
      .where('router_hit.timestamp > :date', { date: nDaysInPast(days) })
      .groupBy('router_hit.country')
      .orderBy('count', 'DESC')
      .cache(true)
      .getRawMany();
  }

  /**
   * Get the number of hits per mirror for the last x days.
   * @param days The number of days to look back
   * @returns An array of objects containing the mirror hostname and the number of hits
   */
  getMirrorStats(days: number): Promise<{ mirror: string; count: number }[]> {
    return this.routerRitRepo
      .createQueryBuilder('router_hit')
      .select('mirror.hostname AS mirror')
      .addSelect('COUNT(mirror.hostname)', 'count')
      .innerJoin('router_hit.hostname', 'mirror')
      .where('router_hit.timestamp > :date', { date: nDaysInPast(days) })
      .groupBy('mirror.hostname')
      .orderBy('count', 'DESC')
      .cache(true)
      .getRawMany();
  }

  /**
   * Get the number of hits per package for the last x days.
   * @param days The number of days to look back
   * @returns An array of objects containing the package name and the number of hits
   */
  getPackageStats(days: number): Promise<{ pkgbase: string; count: number }[]> {
    return this.routerRitRepo
      .createQueryBuilder('router_hit')
      .select('package.pkgname AS pkgbase')
      .addSelect('COUNT(package.pkgname)', 'count')
      .innerJoin('router_hit.pkgbase', 'package')
      .where('router_hit.timestamp > :date', { date: nDaysInPast(days) })
      .groupBy('package.pkgname')
      .orderBy('count', 'DESC')
      .cache(true)
      .getRawMany();
  }

  /**
   * Get the number of hits per day for the last x days.
   * @param days The number of days to look back
   * @returns An array of objects containing the day and the number of hits
   */
  getPerDayStats(days: number): Promise<{ day: string; count: number }[]> {
    return this.routerRitRepo
      .createQueryBuilder('router_hit')
      .select('DATE(router_hit.timestamp) AS date')
      .addSelect('COUNT(DATE(router_hit.timestamp))', 'count')
      .where('router_hit.timestamp > :date', { date: nDaysInPast(days) })
      .groupBy('DATE(router_hit.timestamp)')
      .orderBy('date', 'ASC')
      .cache(true)
      .getRawMany();
  }
}
