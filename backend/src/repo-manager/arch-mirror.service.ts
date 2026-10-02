import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type AxiosResponse } from 'axios';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { In, IsNull, Repository } from 'typeorm';
import {
  IndexCandidate,
  IndexResult,
  ParsedPackage,
  RepoSettings,
  RepoWorkDir,
  TriggerType,
} from '../interfaces/repo-manager';
import { ARCH } from '../utils/constants';
import { downloadFile } from '../utils/download';
import { errorCode } from '../utils/functions';
import { extractPacmanDatabase, parsePacmanDatabases } from './offline/pacman-parse';
import { ArchlinuxPackage, bulkGetOrCreateArch, isRemoved, PackageElfAnalysis } from './repo-manager.entity';
import { saveInBatches } from './save';
import { type ScanJob, SignalScanService } from './scan';
import { pkgTypeOf } from './signal';

const ARCH_REPOS = ['core', 'extra', 'multilib'] as const;
const DEFAULT_MIRROR_URL = 'https://arch.mirror.constant.com';
const ARCH_DATABASE_URL = (mirrorUrl: string, repo: string): string => `${mirrorUrl}/${repo}/os/x86_64/${repo}.files`;

/**
 * While a change is pending, `previousVersion` keeps the last processed version, so a second update compares against the right baseline.
 */
export function recordVersionChange(row: ArchlinuxPackage): void {
  if (!row.triggersPending) {
    row.previousVersion = row.version;
  }

  row.triggersPending = true;
  row.lastUpdated = new Date();
}

/**
 * A removal drops every soname of the package, so its consumers need the triggers too.
 */
export function recordRemoval(row: ArchlinuxPackage): void {
  recordVersionChange(row);
  row.deactivatedAt = row.lastUpdated;
}

/**
 * A failed download must not look like the removal of a whole repo.
 */
function coversEveryRepo(parsed: ParsedPackage[]): boolean {
  const pulledRepos = new Set(parsed.map((pkg) => pkg.repoName));
  return ARCH_REPOS.every((repo) => pulledRepos.has(repo));
}

/**
 * Arch mirror interaction: pull/parse the core+extra pacman databases, diff
 * them against the stored package rows, download changed packages for ELF
 * scanning, and one-off full-mirror indexing.
 */
@Injectable()
export class ArchMirrorService {
  constructor(
    @InjectRepository(ArchlinuxPackage)
    private readonly archPkgRepository: Repository<ArchlinuxPackage>,
    @InjectRepository(PackageElfAnalysis)
    private readonly elfAnalysisRepository: Repository<PackageElfAnalysis>,
    private readonly httpService: HttpService,
    private readonly signalScanService: SignalScanService,
    @InjectPinoLogger(ArchMirrorService.name) private readonly pino: PinoLogger,
  ) {}

  /**
   * Returns every pending change, also those of earlier runs that did not complete.
   */
  async pullChangedArchPackages(settings: RepoSettings): Promise<ArchlinuxPackage[]> {
    const tempDir: string = await mkdtemp(join(tmpdir(), 'chaotic-'));
    this.pino.info('Started pulling Archlinux databases');
    this.pino.debug({ tempDir }, 'Created temporary directory');
    const mirrorUrl = settings.mirrorUrl ?? DEFAULT_MIRROR_URL;

    const downloads: PromiseSettledResult<RepoWorkDir | null>[] = await Promise.allSettled(
      ARCH_REPOS.map(async (repo) => {
        const repoDir = join(tempDir, repo);
        this.pino.debug({ repo }, 'Pulling database');

        try {
          return await this.pullDatabases(ARCH_DATABASE_URL(mirrorUrl, repo), repoDir, repo);
        } catch (err: unknown) {
          this.pino.error({ err }, 'Failed to pull database');
          return null;
        }
      }),
    );

    this.pino.debug('Done pulling all databases');

    const pulled: (RepoWorkDir | null)[] = downloads.map((download) =>
      download.status === 'fulfilled' ? download.value : null,
    );
    const currentArchVersions: ParsedPackage[] = await this.parsePacmanDatabases(pulled);
    await this.determineChangedPackages(currentArchVersions, settings);

    await this.cleanUp([tempDir]);
    return this.findPendingPackages();
  }

  findPendingPackages(): Promise<ArchlinuxPackage[]> {
    return this.archPkgRepository.find({ where: { triggersPending: true } });
  }

  /**
   * A removed package provides nothing now, so it needs no current analysis.
   */
  async withCurrentAnalysis(packages: ArchlinuxPackage[]): Promise<ArchlinuxPackage[]> {
    const scanned = await this.scannedPkgIds(packages);
    return packages.filter((pkg) => isRemoved(pkg) || scanned.has(pkg.id));
  }

  async clearTriggersPending(packages: ArchlinuxPackage[]): Promise<void> {
    if (packages.length === 0) return;

    await this.archPkgRepository.update({ id: In(packages.map((pkg) => pkg.id)) }, { triggersPending: false });
  }

  private async scannedPkgIds(packages: ArchlinuxPackage[]): Promise<Set<number>> {
    const withVersion = packages.filter((pkg): pkg is ArchlinuxPackage & { version: string } => pkg.version !== null);
    if (withVersion.length === 0) return new Set();

    const rows = await this.elfAnalysisRepository.find({
      where: withVersion.map((pkg) => ({ pkgType: pkgTypeOf(TriggerType.ARCH), pkgId: pkg.id, version: pkg.version })),
      select: { pkgId: true },
    });

    return new Set(rows.map((row) => row.pkgId));
  }

  /**
   * A failed scan is retried on the next run, because the change stays pending.
   */
  async scanChangedArchPackages(pending: ArchlinuxPackage[], settings: RepoSettings): Promise<void> {
    const scanned = await this.scannedPkgIds(pending);
    const changed = pending.filter((pkg) => !isRemoved(pkg) && !scanned.has(pkg.id));
    if (changed.length === 0) return;

    this.pino.debug({ count: changed.length }, 'Scanning changed Arch packages for ELF signals');
    const mirrorUrl = settings.mirrorUrl ?? DEFAULT_MIRROR_URL;
    const tempDir: string = await mkdtemp(join(tmpdir(), 'chaotic-signal-'));
    const jobs: ScanJob[] = [];
    try {
      for (const pkg of changed) {
        const filename = pkg.metadata?.filename;
        const version = pkg.version;
        if (!filename || !version) {
          this.pino.warn({ pkgname: pkg.pkgname }, 'No filename or version, skipping scan');
          continue;
        }

        this.pino.debug({ pkgname: pkg.pkgname, version: pkg.version }, 'Scanning changed Arch package');

        // Determine which repo serves this package by probing the mirror.
        // Probe core/extra concurrently (instead of sequentially) and prefer the
        // first match in ARCH_REPOS order.
        const probeRepo = async (candidate: string): Promise<string | undefined> => {
          try {
            const head = await this.httpService.axiosRef({
              url: `${mirrorUrl}/${candidate}/os/x86_64/${filename}`,
              method: 'HEAD',
            });

            return head.status === 200 ? candidate : undefined;
          } catch {
            return undefined;
          }
        };

        const probes = await Promise.all(ARCH_REPOS.map(probeRepo));
        const repo = probes.find((r): r is string => !!r);
        if (!repo) {
          this.pino.warn({ filename }, 'Could not locate package on the mirror, skipping scan');
          continue;
        }

        const downloadPath = join(tempDir, filename);
        try {
          await downloadFile(this.httpService.axiosRef, `${mirrorUrl}/${repo}/os/x86_64/${filename}`, downloadPath);
        } catch (err: unknown) {
          this.pino.warn({ err, filename }, 'Failed to download package');
          continue;
        }

        jobs.push({
          file: downloadPath,
          pkgType: TriggerType.ARCH,
          pkgId: pkg.id,
          version,
        });
      }

      this.pino.info({ count: jobs.length }, 'Scanning changed Arch packages for ELF signals');
      const report = await this.signalScanService.scanPackages(jobs);
      if (report.failed.length > 0) {
        this.pino.error(
          { failed: report.failed.map(({ job, reason }) => ({ pkgId: job.pkgId, version: job.version, reason })) },
          'Changed Arch packages failed to scan, they stay pending for the next run',
        );
      }
    } finally {
      await this.cleanUp([tempDir]);
    }
  }

  /**
   * One-off bootstrap of the signal index. Skips packages that already have a current analysis.
   */
  async indexArchMirror(settings: RepoSettings): Promise<IndexResult> {
    const tempDir: string = await mkdtemp(join(tmpdir(), 'chaotic-index-'));
    this.pino.info('Started indexing the full Arch mirror');

    try {
      const mirrorUrl = settings.mirrorUrl ?? DEFAULT_MIRROR_URL;
      const downloads: PromiseSettledResult<RepoWorkDir | null>[] = await Promise.allSettled(
        ARCH_REPOS.map(async (repo) => {
          const repoDir = join(tempDir, repo);
          return this.pullDatabases(ARCH_DATABASE_URL(mirrorUrl, repo), repoDir, repo);
        }),
      );

      const workDirs: RepoWorkDir[] = [];
      for (const d of downloads) {
        if (d.status === 'fulfilled') {
          if (d.value) {
            workDirs.push(d.value);
          }
        } else {
          this.pino.error({ reason: d.reason }, 'Mirror pull failed');
        }
      }

      const parsed: ParsedPackage[] = await this.parsePacmanDatabases(workDirs);

      const candidates: IndexCandidate[] = [];
      const archPkgNames = parsed
        .filter((pkg) => pkg.name && pkg.metaData?.filename)
        .map((pkg) => pkg.name) as string[];
      const archByName = await bulkGetOrCreateArch(archPkgNames, this.archPkgRepository);
      const archToUpdate: ArchlinuxPackage[] = [];
      for (const pkg of parsed) {
        if (!pkg.name || !pkg.metaData?.filename) continue;

        const archPkg = archByName.get(pkg.name);
        if (!archPkg) continue;

        if (archPkg.version && archPkg.version !== pkg.version) {
          recordVersionChange(archPkg);
        }

        archPkg.version = pkg.version;
        archPkg.arch = ARCH;
        archPkg.pkgrel = pkg.pkgrel;
        archPkg.metadata = pkg.metaData;
        archPkg.deactivatedAt = null;
        archToUpdate.push(archPkg);

        candidates.push({
          pkgId: archPkg.id,
          version: pkg.version,
          filename: pkg.metaData.filename,
          downloadUrl: `${mirrorUrl}/${pkg.repoName}/os/x86_64/${pkg.metaData.filename}`,
          pkgType: TriggerType.ARCH,
        });
      }

      if (coversEveryRepo(parsed)) {
        const currentNames = new Set(archPkgNames);
        const activeRows = await this.archPkgRepository.find({ where: { deactivatedAt: IsNull() } });
        for (const row of activeRows) {
          if (!currentNames.has(row.pkgname) && !archToUpdate.includes(row)) {
            recordRemoval(row);
            archToUpdate.push(row);
          }
        }
      }

      await saveInBatches(this.archPkgRepository, archToUpdate);
      const result: IndexResult = await this.indexCandidates(candidates, tempDir);

      // Newly-indexed providers can resolve other packages' missing sonames, so
      // refresh every broken flag against the now-complete index.
      await this.signalScanService.recomputeBroken();
      this.pino.info(
        { scanned: result.scanned, skipped: result.skipped, failed: result.failed },
        'Full Arch mirror index done',
      );
      return result;
    } finally {
      await this.cleanUp([tempDir]);
    }
  }

  /**
   * Batched download + bounded-concurrency scan, so memory/disk stay bounded.
   */
  async indexCandidates(candidates: IndexCandidate[], tempDir: string): Promise<IndexResult> {
    if (candidates.length === 0) return { scanned: 0, skipped: 0, failed: 0 };

    // Skip packages that already have an analysis for the current version.
    const existing = await this.elfAnalysisRepository.find({
      select: { pkgId: true, pkgType: true, version: true },
    });

    const indexed = new Set(existing.map((a) => `${a.pkgType}:${a.pkgId}:${a.version}`));

    const result: IndexResult = { scanned: 0, skipped: 0, failed: 0 };
    const batchSize = 25;
    const concurrency = 4;
    for (let i = 0; i < candidates.length; i += batchSize) {
      const batch = candidates.slice(i, i + batchSize);
      const jobs: ScanJob[] = [];
      for (const candidate of batch) {
        const key = `${pkgTypeOf(candidate.pkgType)}:${candidate.pkgId}:${candidate.version}`;
        if (indexed.has(key)) {
          result.skipped++;
          continue;
        }

        const downloadPath = join(tempDir, candidate.filename);
        try {
          await downloadFile(this.httpService.axiosRef, candidate.downloadUrl, downloadPath);
        } catch (err: unknown) {
          this.pino.warn({ err, filename: candidate.filename }, 'Failed to download package');
          result.failed++;
          continue;
        }

        jobs.push({
          file: downloadPath,
          pkgType: candidate.pkgType,
          pkgId: candidate.pkgId,
          version: candidate.version,
        });

        indexed.add(key);
      }

      if (jobs.length > 0) {
        const report = await this.signalScanService.scanPackages(jobs, concurrency);
        result.scanned += report.scanned;
        result.failed += report.failed.length;

        for (const { job, reason } of report.failed) {
          this.pino.warn({ file: job.file, reason }, 'Failed to index package');
        }
      }
    }

    return result;
  }

  async pullDatabases(dbUrl: string, repoDir: string, repo: string): Promise<RepoWorkDir | null> {
    const dbDownload: AxiosResponse = await this.httpService.axiosRef({
      url: dbUrl,
      method: 'GET',
      responseType: 'arraybuffer',
    });

    const fileData: Buffer = Buffer.from(dbDownload.data);
    await mkdir(repoDir, { recursive: true });

    try {
      await writeFile(join(repoDir, `${repo}.files`), fileData);
      this.pino.debug({ repo }, 'Done pulling database');
      return {
        path: join(repoDir, `${repo}.files`),
        name: repo,
        workDir: repoDir,
      };
    } catch (err: unknown) {
      this.pino.error({ err }, 'Failed to write database file');
      return null;
    }
  }

  async parsePacmanDatabases(databases: (RepoWorkDir | null)[]): Promise<ParsedPackage[]> {
    this.pino.debug('Started extracting databases');
    const workDirsPromises: PromiseSettledResult<RepoWorkDir>[] = await Promise.allSettled(
      databases.map(async (repo): Promise<RepoWorkDir> => {
        try {
          if (!repo || !repo.path) throw new Error('Database entry has no path');

          const workDir = repo.path.replace(/\/[^/]+\.files$/, '');

          this.pino.debug({ path: repo.path }, 'Unpacking database');
          await extractPacmanDatabase(repo.path, workDir);
          return { path: workDir, name: repo.name, workDir };
        } catch (err: unknown) {
          this.pino.error({ err }, 'Failed to extract database');
          throw err;
        }
      }),
    );
    this.pino.debug('Done extracting databases');

    const parsed = await parsePacmanDatabases(
      workDirsPromises.map((workDir) => (workDir.status === 'fulfilled' ? workDir.value : null)),
    );
    this.pino.info({ count: parsed.length }, 'Total packages processed');

    return parsed;
  }

  /**
   * Split packages are included: the subpackages (llvm-libs, gcc-libs, boost-libs) ship most sonames.
   */
  private async determineChangedPackages(currentArchVersions: ParsedPackage[], settings: RepoSettings): Promise<void> {
    if (currentArchVersions.length === 0) {
      this.pino.error('No packages found in databases');
      return;
    }

    // One query and one bulk insert resolve all missing Arch packages. A
    // per-package loop would issue N serialized round-trips.
    const archByName = await bulkGetOrCreateArch(
      currentArchVersions.map((p) => p.name).filter((n): n is string => !!n),
      this.archPkgRepository,
    );

    const currentNames = new Set(currentArchVersions.map((p) => p.name).filter((n): n is string => !!n));
    const changed: ArchlinuxPackage[] = [];
    const changedByName = new Map<string, ArchlinuxPackage>();
    const markChanged = (row: ArchlinuxPackage): void => {
      if (!changedByName.has(row.pkgname)) {
        changedByName.set(row.pkgname, row);
        changed.push(row);
      }
    };

    for (const pkg of currentArchVersions) {
      if (!pkg.name) continue;

      const archPkg = archByName.get(pkg.name);
      if (!archPkg) continue;

      if (!settings.regenDatabase && archPkg.version && archPkg.version === pkg.version) {
        if (archPkg.deactivatedAt !== null) {
          archPkg.deactivatedAt = null;
          markChanged(archPkg);
        }

        continue;
      }

      if (settings.regenDatabase) {
        archPkg.triggersPending = true;
      } else {
        this.pino.info({ pkgname: pkg.name }, 'Package has changed, updating records');
        recordVersionChange(archPkg);
      }

      archPkg.version = pkg.version;
      archPkg.arch = ARCH;
      archPkg.pkgrel = pkg.pkgrel;
      archPkg.metadata = pkg.metaData;
      archPkg.deactivatedAt = null;
      markChanged(archPkg);
    }

    await this.deactivateRemovedPackages(currentArchVersions, currentNames, markChanged);

    // Persist updates in batches instead of one fire-and-forget save per package.
    await saveInBatches(this.archPkgRepository, changed);

    this.pino.debug({ count: changed.length }, 'Done determining changed packages');
  }

  private async deactivateRemovedPackages(
    currentArchVersions: ParsedPackage[],
    currentNames: Set<string>,
    markChanged: (row: ArchlinuxPackage) => void,
  ): Promise<void> {
    if (!coversEveryRepo(currentArchVersions)) {
      this.pino.warn('Not every Arch database was parsed, skipping the removal of packages');
      return;
    }

    const activeRows = await this.archPkgRepository.find({ where: { deactivatedAt: IsNull() } });
    const removed = activeRows.filter((row) => !currentNames.has(row.pkgname));
    for (const row of removed) {
      recordRemoval(row);
      markChanged(row);
    }

    if (removed.length > 0) {
      this.pino.info({ pkgnames: removed.map((row) => row.pkgname) }, 'Deactivating Arch packages no longer in DBs');
    }
  }

  async cleanUp(dirs: string[]): Promise<void> {
    this.pino.info('Cleaning up');

    for (const dir of dirs) {
      if (!dir) {
        this.pino.warn('Skipping null or empty directory in cleanup');
        continue;
      }

      try {
        const dirStats = await stat(dir);
        if (dirStats.isDirectory()) {
          await rm(dir, { recursive: true, force: true });
          this.pino.debug({ dir }, 'Cleaned up directory');
        } else {
          this.pino.warn({ dir }, 'Path is not a directory, skipping');
        }
      } catch (err: unknown) {
        if (errorCode(err) === 'ENOENT') {
          this.pino.debug({ dir }, 'Directory already removed or missing');
        } else {
          this.pino.error({ err, dir }, 'Failed to cleanup directory');
        }
      }
    }
  }
}
