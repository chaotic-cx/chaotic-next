import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { PackageBump, PackageElfAnalysis } from '../repo-manager/repo-manager.entity';
import { SignalScanService } from '../repo-manager/scan';
import { RouterHit } from '../router/router-hit.entity';
import { compareArchVersions } from '../repo-manager/signal';
import { errorMessage, nDaysInPast } from '../utils/functions';
import { Build, Package } from './builder.entity';

/** Analyses kept per package: the latest plus the previous the ABI index compares. */
const KEEP_ANALYSIS_VERSIONS = 2;

/**
 * A no-repo package whose most recent build is older than this many days is
 * considered dead — nothing points at it as an active package anymore, so its
 * historical builds are purged along with it.
 */
const STALE_BUILD_GRACE_DAYS = 90;
const VALID_PKGNAME_PATTERN = '^[a-zA-Z0-9][a-zA-Z0-9@._+-]*$';

/** How long raw router hits are kept before they are purged. */
const ROUTER_HITS_RETENTION_DAYS = 365;

/**
 * Rows deleted per purge loop iteration. Batching (via ctid) avoids one giant
 * lock/transaction on the first run, when a large backlog may exist.
 */
const ROUTER_HITS_BATCH_SIZE = 10_000;

@Injectable()
export class DatabaseCleanupService {
  private readonly logger = new Logger(DatabaseCleanupService.name);

  constructor(
    @InjectRepository(Package)
    private readonly packageRepository: Repository<Package>,
    @InjectRepository(PackageElfAnalysis)
    private readonly analysisRepository: Repository<PackageElfAnalysis>,
    private readonly dataSource: DataSource,
    private readonly signalScanService: SignalScanService,
  ) {}

  /**
   * Purge legacy packages with no repo. Deactivate still-active ones (so they
   * stop surfacing as unknown), then delete every null-repo package no Build
   * references, together with its bump history and ELF analysis. Build-referenced
   * packages are kept: `Build.pkgbase` cascades the deletion and those rows are
   * still needed to render the deploy log.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeOrphanedPackages(): Promise<void> {
    try {
      const deactivated = await this.packageRepository
        .createQueryBuilder()
        .update(Package)
        .set({ isActive: false })
        .where('"repoId" IS NULL')
        .andWhere('"isActive" = true')
        .execute();
      const deactivatedCount = deactivated.affected ?? 0;
      if (deactivatedCount > 0) {
        this.logger.log(`Deactivated ${deactivatedCount} packages without a repo`);
      }

      await this.dataSource.transaction(async (manager) => {
        const candidates = await manager
          .getRepository(Package)
          .createQueryBuilder('p')
          .select('p.id', 'id')
          .leftJoin(Build, 'b', 'b.pkgbaseId = p.id')
          .where('p.repoId IS NULL')
          .andWhere('b.id IS NULL')
          .getRawMany<{ id: number }>();

        if (candidates.length === 0) return;
        await this.deletePackages(
          manager,
          candidates.map((row) => row.id),
        );
        this.logger.log(`Purged ${candidates.length} orphaned packages without a repo`);
      });
    } catch (err: unknown) {
      this.logger.error(`Failed to purge orphaned packages: ${errorMessage(err)}`);
    }
  }

  /**
   * Purge packages whose name is not a valid Arch package name. These come from
   * malformed router/build inputs.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeInvalidNamedPackages(): Promise<void> {
    try {
      const deactivated = await this.packageRepository
        .createQueryBuilder()
        .update(Package)
        .set({ isActive: false })
        .where('"pkgname" !~ :validPattern', { validPattern: VALID_PKGNAME_PATTERN })
        .andWhere('"isActive" = true')
        .execute();
      const deactivatedCount = deactivated.affected ?? 0;
      if (deactivatedCount > 0) {
        this.logger.log(`Deactivated ${deactivatedCount} packages with an invalid name`);
      }

      await this.dataSource.transaction(async (manager) => {
        const candidates = await manager
          .getRepository(Package)
          .createQueryBuilder('p')
          .select('p.id', 'id')
          .where('p.pkgname !~ :validPattern', { validPattern: VALID_PKGNAME_PATTERN })
          .getRawMany<{ id: number }>();

        if (candidates.length === 0) return;
        await this.deletePackages(
          manager,
          candidates.map((row) => row.id),
        );
        this.logger.log(`Purged ${candidates.length} packages with an invalid name`);
      });
    } catch (err: unknown) {
      this.logger.error(`Failed to purge packages with invalid names: ${errorMessage(err)}`);
    }
  }

  /**
   * Purge no-repo packages whose most recent build is older than the grace
   * window. The orphaned purge above keeps any build-referenced package so the
   * deploy log survives, but a package with no repo and only stale builds is
   * dead weight — delete it (and its old builds) instead of hoarding it forever.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeStaleBuildReferencedPackages(): Promise<void> {
    const cutoff = nDaysInPast(STALE_BUILD_GRACE_DAYS);
    try {
      const deactivated = await this.packageRepository
        .createQueryBuilder()
        .update(Package)
        .set({ isActive: false })
        .where('"repoId" IS NULL')
        .andWhere('"isActive" = true')
        .andWhere(
          `NOT EXISTS (
            SELECT 1 FROM "build" b WHERE b."pkgbaseId" = "package"."id" AND b.timestamp >= :cutoff
          )`,
          { cutoff },
        )
        .execute();
      const deactivatedCount = deactivated.affected ?? 0;
      if (deactivatedCount > 0) {
        this.logger.log(`Deactivated ${deactivatedCount} packages with only stale builds`);
      }

      await this.dataSource.transaction(async (manager) => {
        const candidates = await manager
          .getRepository(Package)
          .createQueryBuilder('p')
          .select('p.id', 'id')
          .where('p.repoId IS NULL')
          .andWhere(
            `NOT EXISTS (
            SELECT 1 FROM "build" b WHERE b."pkgbaseId" = p.id AND b.timestamp >= :cutoff
          )`,
            { cutoff },
          )
          .andWhere('EXISTS (SELECT 1 FROM "build" b WHERE b."pkgbaseId" = p.id)')
          .getRawMany<{ id: number }>();

        if (candidates.length === 0) return;
        await this.deletePackages(
          manager,
          candidates.map((row) => row.id),
        );
        this.logger.log(`Purged ${candidates.length} packages with only stale builds`);
      });
    } catch (err: unknown) {
      this.logger.error(`Failed to purge packages with only stale builds: ${errorMessage(err)}`);
    }
  }

  /**
   * Remove a package together with its Chaotic ELF analysis and bump history,
   * dropping the cached signal index so it rebuilds on next use.
   */
  private async deletePackages(manager: EntityManager, ids: number[]): Promise<void> {
    await manager.getRepository(PackageElfAnalysis).delete({ pkgType: '1', pkgId: In(ids) });
    await manager.getRepository(PackageBump).delete({ pkg: { id: In(ids) } });
    await manager.getRepository(Package).delete({ id: In(ids) });
    this.signalScanService.invalidateDirectoryIndex();
  }

  /**
   * Purge superseded analysis versions, keeping the latest and the previous per
   * package — the pair `buildPluginBreakIndex` compares for ABI breaks. Without
   * pruning these accumulate a row per scanned version.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeSupersededAnalyses(): Promise<void> {
    try {
      const analyses = await this.analysisRepository.find({
        select: { id: true, pkgType: true, pkgId: true, version: true },
      });
      const byPackage = new Map<string, PackageElfAnalysis[]>();
      for (const analysis of analyses) {
        const key = `${analysis.pkgType}:${analysis.pkgId}`;
        const list = byPackage.get(key) ?? [];
        list.push(analysis);
        byPackage.set(key, list);
      }

      const toDelete: number[] = [];
      for (const list of byPackage.values()) {
        if (list.length <= KEEP_ANALYSIS_VERSIONS) continue;
        const sorted = [...list].sort((a, b) => compareArchVersions(b.version, a.version));
        for (const analysis of sorted.slice(KEEP_ANALYSIS_VERSIONS)) toDelete.push(analysis.id);
      }

      if (toDelete.length === 0) return;
      await this.analysisRepository.delete(toDelete);
      this.signalScanService.invalidateDirectoryIndex();
      this.logger.log(`Purged ${toDelete.length} superseded analysis version(s), keeping latest + previous`);
    } catch (err: unknown) {
      this.logger.error(`Failed to purge superseded analyses: ${errorMessage(err)}`);
    }
  }

  /**
   * Purge raw router hits older than the retention window. They are only used
   * for metrics aggregation, so old rows are dead weight. Deletion is batched
   * (via ctid) so a large first-run backlog never locks the table in one go.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeOldRouterHits(): Promise<void> {
    const cutoff = nDaysInPast(ROUTER_HITS_RETENTION_DAYS);
    try {
      const repository = this.dataSource.getRepository(RouterHit);
      let purged = 0;
      for (;;) {
        const { affected } = await repository
          .createQueryBuilder()
          .delete()
          .where('timestamp < :cutoff', { cutoff })
          .andWhere(
            `ctid IN (
              SELECT ctid FROM "router-hits" WHERE timestamp < :cutoff LIMIT :limit
            )`,
            { cutoff, limit: ROUTER_HITS_BATCH_SIZE },
          )
          .execute();
        const deleted = affected ?? 0;
        purged += deleted;
        if (deleted < ROUTER_HITS_BATCH_SIZE) break;
      }
      if (purged > 0) {
        this.logger.log(`Purged ${purged} old router hits (retention ${ROUTER_HITS_RETENTION_DAYS} days)`);
      }
    } catch (err: unknown) {
      this.logger.error(`Failed to purge old router hits: ${errorMessage(err)}`);
    }
  }
}
