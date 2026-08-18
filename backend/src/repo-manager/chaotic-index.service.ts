import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { bulkGetOrCreatePackages, Package, Repo, getOrCreateRepo } from '../builder/builder.entity';
import { saveInBatches } from './save';
import { SignalScanService } from './scan';
import { ArchMirrorService } from './arch-mirror.service';
import { IndexCandidate, IndexResult, ParsedPackage, RepoWorkDir, TriggerType } from '../interfaces/repo-manager';

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
        chaoticPkg.metadata = pkg.metaData;
        chaoticPkg.isActive = true;
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

    const downloads: PromiseSettledResult<RepoWorkDir | null>[] = await Promise.allSettled(
      repos.map(async (repo) => {
        const tempDir: string = await mkdtemp(join(tmpdir(), 'chaotic-'));
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
      if (pkg.pkgrel.toString().match(/\./)) {
        chaoticPkg.pkgrel = Number(pkg.pkgrel.toFixed());
      } else {
        chaoticPkg.pkgrel = pkg.pkgrel;
      }
      chaoticPkg.version = pkg.version;
      chaoticPkg.isActive = true;
      chaoticPkg.metadata = pkg.metaData;
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
    const toDeactivate: Package[] = [];
    for (const pkg of allChaoticVersionsInDb) {
      if (pkg.isActive && !currentKeys.has(`${pkg.repo?.name}:${pkg.pkgname}`)) {
        this.logger.log(`Setting ${pkg.pkgname} in repo ${pkg.repo?.name ?? 'unknown'} to inactive`);
        pkg.isActive = false;
        toDeactivate.push(pkg);
      }
    }
    await saveInBatches(this.packagesRepository, toDeactivate);
    this.logger.debug('Finished setting non-existing packages to inactive');
  }
}
