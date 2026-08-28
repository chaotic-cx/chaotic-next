import { bulkGetOrCreatePackages, getOrCreateRepo, Package, Repo } from '../builder/builder.entity';
import { IndexCandidate, IndexResult, ParsedPackage, RepoWorkDir, TriggerType } from '../interfaces/repo-manager';
import { ArchMirrorService } from './arch-mirror.service';
import { saveInBatches } from './save';
import { SignalScanService } from './scan';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Repository } from 'typeorm';

/**
 * Chaotic-AUR repo indexing: one-off bulk index of a repo mirror (used to
 * bootstrap the signal index) and the incremental database-version sync that
 * runs after successful builds.
 */

/** CDN location of the Chaotic-AUR package database used for bulk indexing. */
export const CHAOTIC_CDN_DATABASE_URL = 'https://cdn-mirror.chaotic.cx/chaotic-aur/x86_64/chaotic-aur.db';

@Injectable()
export class ChaoticIndexService {
  private readonly logger = new Logger(ChaoticIndexService.name);

  constructor(
    private readonly archMirror: ArchMirrorService,
    @InjectRepository(Package)
    private readonly packagesRepository: Repository<Package>,
    @InjectRepository(Repo)
    private readonly repoRepository: Repository<Repo>,
    private readonly signalScanService: SignalScanService,
  ) {}

  /**
   * One-off bulk index of a Chaotic repo. `dbUrl` must point at the repo's
   * database file (e.g. `<repo>.files`); archives are fetched from the same
   * directory. Skips packages already analyzed for their current version.
   */
  async indexChaoticRepo(dbUrl: string = CHAOTIC_CDN_DATABASE_URL): Promise<IndexResult> {
    const tempDir: string = await mkdtemp(join(tmpdir(), 'chaotic-index-'));
    this.logger.log(`Started indexing Chaotic repo from ${dbUrl}...`);
    try {
      const dbName =
        dbUrl
          .split('/')
          .pop()
          ?.replace(/\.(files|db)$/, '') ?? 'chaotic-aur';
      const workDir = await this.archMirror.pullDatabases(dbUrl, tempDir, dbName);
      if (!workDir) throw new Error(`Failed to pull database ${dbUrl}`);
      const parsed: ParsedPackage[] = await this.archMirror.parsePacmanDatabases([workDir]);

      const baseUrl: string = dbUrl.replace(/\/[^/]+$/, '');
      // A single repo backs this whole database; resolve it once instead of per
      // package, then bulk-resolve every package row in one query + insert.
      const repo: Repo = await getOrCreateRepo(dbName, this.repoRepository);
      const chaoticEntries = parsed.flatMap((pkg) =>
        pkg.name && pkg.metaData?.filename ? [{ pkgname: pkg.name, repo }] : [],
      );
      const chaoticByKey = await bulkGetOrCreatePackages(chaoticEntries, this.packagesRepository);

      const candidates: IndexCandidate[] = [];
      const toUpdate: Package[] = [];
      for (const pkg of parsed) {
        if (!pkg.name || !pkg.metaData?.filename) continue;
        const chaoticPkg = chaoticByKey.get(`${repo.name}:${pkg.name}`);
        if (!chaoticPkg) continue;
        chaoticPkg.version = pkg.version;
        chaoticPkg.pkgrel = pkg.pkgrel;
        chaoticPkg.bump = pkg.bump;
        chaoticPkg.metadata = pkg.metaData;
        chaoticPkg.pkgbaseName = pkg.base;
        markActive(chaoticPkg);
        chaoticPkg.repo = repo;
        toUpdate.push(chaoticPkg);

        if (chaoticPkg.skipSignalScan) {
          this.logger.log(`Skipping ${pkg.name}: marked binary-only (skip signal scan)`);
          continue;
        }

        candidates.push({
          pkgId: chaoticPkg.id,
          version: pkg.version,
          filename: pkg.metaData.filename,
          downloadUrl: `${baseUrl}/${pkg.metaData.filename}`,
          pkgType: TriggerType.CHAOTIC,
        });
      }
      await saveInBatches(this.packagesRepository, toUpdate);

      const result: IndexResult = await this.archMirror.indexCandidates(candidates, tempDir);
      // Newly-indexed providers can resolve other packages' missing sonames, so
      // refresh every broken flag against the now-complete index.
      await this.signalScanService.recomputeBroken();
      this.logger.log(
        `Full Chaotic repo index done: ${result.scanned} scanned, ${result.skipped} skipped, ${result.failed} failed`,
      );
      return result;
    } finally {
      await this.archMirror.cleanUp([tempDir]);
    }
  }

  async updateChaoticDatabaseVersions(repos: Repo[]): Promise<void> {
    const repoNames: string[] = repos.map((repo) => repo.name);

    this.logger.log(`Updating database of ${repoNames.join(', ')}...`);
    const tempDirs: string[] = [];

    try {
      const downloads: PromiseSettledResult<RepoWorkDir | null>[] = await Promise.allSettled(
        repos.map(async (repo) => {
          const tempDir: string = await mkdtemp(join(tmpdir(), 'chaotic-'));
          tempDirs.push(tempDir);
          this.logger.debug(`Created temporary directory ${tempDir}`);
          return await this.archMirror.pullDatabases(repo.dbPath, tempDir, repo.name);
        }),
      );

      this.logger.debug('Done pulling all Chaotic-AUR databases');
      const workDirs: RepoWorkDir[] = [];
      for (const download of downloads) {
        if (download.status === 'fulfilled' && download.value) {
          workDirs.push(download.value);
        }
      }
      const currentChaoticVersions: ParsedPackage[] = await this.archMirror.parsePacmanDatabases(workDirs);

      this.logger.debug('Updating Chaotic database versions...');
      // Bulk-resolve every package row in one query + insert instead of one
      // serialized getOrCreatePackage() round-trip per package, and persist in batches
      // (awaited) instead of fire-and-forget saves that can be lost on crash.
      const repoByName = new Map(repos.map((r) => [r.name, r] as const));
      const chaoticEntries: { pkgname: string; repo: Repo }[] = [];
      for (const pkg of currentChaoticVersions) {
        if (!pkg.name) continue;
        const repo = repoByName.get(pkg.repoName);
        if (!repo) continue;
        chaoticEntries.push({ pkgname: pkg.name, repo });
      }
      const chaoticByKey = await bulkGetOrCreatePackages(chaoticEntries, this.packagesRepository);

      const toUpdate: Package[] = [];
      for (const pkg of currentChaoticVersions) {
        if (!pkg.name) continue;
        const repo = repoByName.get(pkg.repoName);
        if (!repo) continue;
        const chaoticPkg = chaoticByKey.get(`${repo.name}:${pkg.name}`);
        if (!chaoticPkg) continue;

        // Account for already bumped packages
        chaoticPkg.pkgrel = pkg.pkgrel;
        chaoticPkg.bump = pkg.bump;
        chaoticPkg.version = pkg.version;
        markActive(chaoticPkg);
        chaoticPkg.metadata = pkg.metaData;
        chaoticPkg.pkgbaseName = pkg.base;
        chaoticPkg.repo = repo;
        toUpdate.push(chaoticPkg);
      }
      await saveInBatches(this.packagesRepository, toUpdate);
      this.logger.log('Finished updating Chaotic database versions');

      // Lastly, set any non-existing packages to inactive. The database can contain inactive
      // packages that are not in the Chaotic-AUR database anymore.
      this.logger.debug('Setting non-existing packages to inactive...');
      // O(1) membership via a Set instead of an O(N*M) scan over currentChaoticVersions.
      const currentKeys = new Set(currentChaoticVersions.map((p) => `${p.repoName}:${p.name}`));
      const allChaoticVersionsInDb: Package[] = await this.packagesRepository.find({
        relations: {
          repo: true,
        },
      });
      const toDeactivate: Package[] = deactivateMissing(allChaoticVersionsInDb, currentKeys, () => new Date());
      for (const pkg of toDeactivate) {
        this.logger.log(`Setting ${pkg.pkgname} in repo ${pkg.repo?.name ?? 'unknown'} to inactive`);
      }
      await saveInBatches(this.packagesRepository, toDeactivate);

      // Drop inactive rows that merely duplicate an active package in another
      // repo (e.g. stale garuda rows left over from when garuda mirrored the
      // chaotic-aur DB). These are version-less rows created by the bulk import
      // that never represented a real package, so removing them keeps the
      // repository table clean instead of letting junk accumulate.
      const duplicates = findDuplicateInactiveRows(allChaoticVersionsInDb);
      if (duplicates.length > 0) {
        const ids = duplicates.map((pkg) => pkg.id);
        this.logger.log(`Removing ${duplicates.length} duplicate inactive package rows`);
        // Only delete rows with no build history; builds FK-reference the package.
        await this.packagesRepository
          .createQueryBuilder()
          .delete()
          .from(Package)
          .where('id IN (:...ids)', { ids })
          .andWhere(`NOT EXISTS (SELECT 1 FROM "build" b WHERE b."pkgbaseId" = "package".id)`)
          .execute();
      }
      this.logger.debug('Finished setting non-existing packages to inactive');
    } finally {
      await this.archMirror.cleanUp(tempDirs);
    }
  }
}

/** Marks a package as currently present/active, clearing any prior removal time. */
export function markActive(pkg: Package): void {
  pkg.isActive = true;
  pkg.removedAt = null;
}

/**
 * Returns the active packages absent from `currentKeys` (i.e. removed from the
 * repo) after marking them inactive and stamping their removal time. Packages
 * already inactive are left untouched.
 */
export function deactivateMissing(allPackages: Package[], currentKeys: Set<string>, now: () => Date): Package[] {
  const toDeactivate: Package[] = [];
  for (const pkg of allPackages) {
    if (pkg.isActive && !currentKeys.has(`${pkg.repo?.name}:${pkg.pkgname}`)) {
      pkg.isActive = false;
      pkg.removedAt = now().toISOString();
      toDeactivate.push(pkg);
    }
  }
  return toDeactivate;
}

/**
 * Returns inactive, version-less rows whose pkgname is active in another repo.
 * These are bulk-import duplicates (never a real package of their own repo) and
 * can be safely deleted instead of accumulating as stale inactive rows.
 */
export function findDuplicateInactiveRows(allPackages: Package[]): Package[] {
  const activePkgNames = new Set(allPackages.filter((pkg) => pkg.isActive).map((pkg) => pkg.pkgname));
  return allPackages.filter((pkg) => !pkg.isActive && pkg.version === null && activePkgNames.has(pkg.pkgname));
}
