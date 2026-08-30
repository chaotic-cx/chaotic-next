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
import { ArchlinuxPackage, bulkGetOrCreateArch, PackageElfAnalysis } from './repo-manager.entity';
import { saveInBatches } from './save';
import { SignalScanService, type ScanJob } from './scan';
import { pkgTypeOf } from './signal';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type AxiosResponse } from 'axios';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Repository } from 'typeorm';

const ARCH_REPOS = ['core', 'extra'] as const;
const DEFAULT_MIRROR_URL = 'https://arch.mirror.constant.com';
const ARCH_DATABASE_URL = (mirrorUrl: string, repo: string): string => `${mirrorUrl}/${repo}/os/x86_64/${repo}.files`;

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

  /** Pull the Arch databases and return the packages that changed versions. */
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
    const changed = await this.determineChangedPackages(currentArchVersions, settings);

    await this.cleanUp([tempDir]);
    return changed;
  }

  /**
   * Scan this run's changed Arch packages. The mirror doubles as the build
   * mirror, so archives live at `{mirrorUrl}/{repo}/os/x86_64/{filename}`.
   */
  async scanChangedArchPackages(changed: ArchlinuxPackage[], settings: RepoSettings): Promise<void> {
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
      await this.signalScanService.scanPackages(jobs);
    } finally {
      await this.cleanUp([tempDir]);
    }
  }

  /** One-off bulk bootstrap of the signal index; the regular incremental path
   * (`run`/`scanChangedArchPackages`) is unaffected. Skips packages that
   * already have an analysis for their current version. */
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
          if (d.value) workDirs.push(d.value);
        } else {
          this.pino.error({ reason: d.reason }, 'Mirror pull failed');
        }
      }
      const parsed: ParsedPackage[] = await this.parsePacmanDatabases(workDirs);

      // Ensure every package has an archlinux_package row so analyses get a
      // stable pkgId, and gather the download candidates.
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
        archPkg.version = pkg.version;
        archPkg.arch = ARCH;
        archPkg.pkgrel = pkg.pkgrel;
        archPkg.metadata = pkg.metaData;
        archToUpdate.push(archPkg);

        candidates.push({
          pkgId: archPkg.id,
          version: pkg.version,
          filename: pkg.metaData.filename,
          downloadUrl: `${mirrorUrl}/${pkg.repoName}/os/x86_64/${pkg.metaData.filename}`,
          pkgType: TriggerType.ARCH,
        });
      }
      // Persist every row in batches instead of one save() per package.
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

  /** Batched download + bounded-concurrency scan, so memory/disk stay bounded. */
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
        await this.signalScanService.scanPackages(jobs, concurrency);
        result.scanned += jobs.length;
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

  private async determineChangedPackages(
    currentArchVersions: ParsedPackage[],
    settings: RepoSettings,
  ): Promise<ArchlinuxPackage[]> {
    if (currentArchVersions.length === 0) {
      this.pino.error('No packages found in databases');
      return [];
    }

    const result: ArchlinuxPackage[] = [];

    // One query and one bulk insert resolve all missing Arch packages. A
    // per-package loop would issue N serialized round-trips.
    const archByName = await bulkGetOrCreateArch(
      currentArchVersions.map((p) => p.name).filter((n): n is string => !!n),
      this.archPkgRepository,
    );

    const changed: ArchlinuxPackage[] = [];
    for (const pkg of currentArchVersions) {
      if (!pkg.name) continue;
      const archPkg = archByName.get(pkg.name);
      if (!archPkg) continue;

      if (!settings.regenDatabase && archPkg.version && archPkg.version === pkg.version) {
        continue;
      }

      if (!settings.regenDatabase) {
        this.pino.info({ pkgname: pkg.name }, 'Package has changed, updating records');
        archPkg.previousVersion = archPkg.version;
        archPkg.lastUpdated = new Date();
      }
      archPkg.version = pkg.version;
      archPkg.arch = ARCH;
      archPkg.pkgrel = pkg.pkgrel;
      archPkg.metadata = pkg.metaData;
      changed.push(archPkg);

      // We are only interested in the base packages but still want all metadata saved
      if (pkg.base === pkg.name) result.push(archPkg);
    }

    // Persist updates in batches instead of one fire-and-forget save per package.
    await saveInBatches(this.archPkgRepository, changed);

    this.pino.debug({ count: result.length }, 'Done determining changed packages');
    return result;
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
