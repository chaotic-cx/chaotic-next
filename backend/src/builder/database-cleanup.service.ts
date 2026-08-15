import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { SignalScanService } from '../repo-manager/scan';
import { PackageBump, PackageElfAnalysis } from '../repo-manager/repo-manager.entity';
import { compareArchVersions } from '../repo-manager/signal';
import { errorMessage } from '../utils/functions';
import { Build, Package } from './builder.entity';

/** Analyses kept per package: the latest plus the previous the ABI index compares. */
const KEEP_ANALYSIS_VERSIONS = 2;

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

        const ids: number[] = candidates.map((row) => row.id);
        // ELF analysis rows only reference packages for Chaotic triggers
        // (pkgType '1'); '0' rows point at ArchlinuxPackage ids instead.
        await manager.getRepository(PackageElfAnalysis).delete({ pkgType: '1', pkgId: In(ids) });
        await manager.getRepository(PackageBump).delete({ pkg: { id: In(ids) } });
        await manager.getRepository(Package).delete({ id: In(ids) });

        // The deleted analyses may have contributed directories to the cached
        // signal index, so drop it to force a rebuild on next use.
        this.signalScanService.invalidateDirectoryIndex();

        this.logger.log(`Purged ${ids.length} orphaned packages without a repo`);
      });
    } catch (err: unknown) {
      this.logger.error(`Failed to purge orphaned packages: ${errorMessage(err)}`);
    }
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
}
