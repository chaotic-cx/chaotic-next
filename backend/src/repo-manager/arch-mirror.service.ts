import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { AxiosResponse } from 'axios';
import { ARCH } from '../utils/constants';
import { errorCode, errorMessage } from '../utils/functions';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Repository } from 'typeorm';
import {
  IndexCandidate,
  IndexResult,
  ParsedPackage,
  RepoSettings,
  RepoWorkDir,
  TriggerType,
} from '../interfaces/repo-manager';
import { extractPacmanDatabase, listPackageDirs, parsePackageDesc, parsePackageFiles } from './offline/pacman-parse';
import { ArchlinuxPackage, bulkGetOrCreateArch, PackageElfAnalysis } from './repo-manager.entity';
import { saveInBatches } from './save';
import { type ScanJob, SignalScanService } from './scan';
import { pkgTypeOf } from './signal';

const ARCH_REPOS = ['core', 'extra'] as const;
const ARCH_REPO_URL = (name: string) => `https://arch.mirror.constant.com/${name}/os/x86_64/${name}.files`;
const DEFAULT_MIRROR_URL = 'https://arch.mirror.constant.com';

/**
 * Arch mirror interaction: pull/parse the core+extra pacman databases, diff
 * them against the stored package rows, download changed packages for ELF
 * scanning, and one-off full-mirror indexing.
 */
@Injectable()
export class ArchMirrorService {
  private readonly logger = new Logger(ArchMirrorService.name);

  constructor(
    @InjectRepository(ArchlinuxPackage)
    private readonly archPkgRepository: Repository<ArchlinuxPackage>,
    @InjectRepository(PackageElfAnalysis)
    private readonly elfAnalysisRepository: Repository<PackageElfAnalysis>,
    private readonly httpService: HttpService,
    private readonly signalScanService: SignalScanService,
  ) {}

  /** Pull the Arch databases and return the packages that changed versions. */
  async pullChangedArchPackages(settings: RepoSettings): Promise<ArchlinuxPackage[]> {
    const tempDir: string = await mkdtemp(join(tmpdir(), 'chaotic-'));
    this.logger.log('Started pulling Archlinux databases...');
    this.logger.debug(`Created temporary directory ${tempDir}`);

    const downloads: PromiseSettledResult<RepoWorkDir | null>[] = await Promise.allSettled(
      ARCH_REPOS.map(async (repo) => {
        const repoUrl = ARCH_REPO_URL(repo);
        const repoDir = join(tempDir, repo);
        this.logger.debug(`Pulling database for ${repo}...`);
        try {
          return await this.pullDatabases(repoUrl, repoDir, repo);
        } catch (err: unknown) {
          this.logger.error(errorMessage(err));
          return null;
        }
      }),
    );

    this.logger.debug('Done pulling all databases');

    const pulled: Array<RepoWorkDir | null> = downloads.map((download) =>
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

    this.logger.debug(`Scanning ${changed.length} changed Arch package(s) for ELF signals`);
    const mirrorUrl = settings.mirrorUrl ?? DEFAULT_MIRROR_URL;
    const tempDir: string = await mkdtemp(join(tmpdir(), 'chaotic-signal-'));
    const jobs: ScanJob[] = [];

    try {
      for (const pkg of changed) {
        const filename = pkg.metadata?.filename;
        if (!filename) {
          this.logger.warn(`No filename for ${pkg.pkgname}, skipping scan`);
          continue;
        }
        this.logger.debug(`Scanning changed Arch package ${pkg.pkgname} (${pkg.version})`);

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
          this.logger.warn(`Could not locate ${filename} on the mirror, skipping scan`);
          continue;
        }

        const downloadPath = join(tempDir, filename);
        try {
          const response = await this.httpService.axiosRef({
            url: `${mirrorUrl}/${repo}/os/x86_64/${filename}`,
            method: 'GET',
            responseType: 'arraybuffer',
          });
          await writeFile(downloadPath, Buffer.from(response.data, 'binary'));
        } catch (err: unknown) {
          this.logger.warn(`Failed to download ${filename}: ${errorMessage(err)}`);
          continue;
        }

        jobs.push({
          file: downloadPath,
          pkgType: TriggerType.ARCH,
          pkgId: pkg.id,
          version: pkg.version,
        });
      }

      this.logger.log(`Scanning ${jobs.length} changed Arch package(s) for ELF signals`);
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
    this.logger.log('Started indexing the full Arch mirror...');
    try {
      const downloads: PromiseSettledResult<RepoWorkDir | null>[] = await Promise.allSettled(
        ARCH_REPOS.map(async (repo) => {
          const repoDir = join(tempDir, repo);
          return this.pullDatabases(ARCH_REPO_URL(repo), repoDir, repo);
        }),
      );

      const workDirs: RepoWorkDir[] = [];
      for (const d of downloads) {
        if (d.status === 'fulfilled') {
          if (d.value) workDirs.push(d.value);
        } else {
          this.logger.error(`Mirror pull failed: ${d.reason instanceof Error ? d.reason.message : String(d.reason)}`);
        }
      }
      const parsed: ParsedPackage[] = await this.parsePacmanDatabases(workDirs);

      // Ensure every package has an archlinux_package row so analyses get a
      // stable pkgId, and gather the download candidates.
      const candidates: IndexCandidate[] = [];
      const mirrorUrl = settings.mirrorUrl ?? DEFAULT_MIRROR_URL;
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
      this.logger.log(
        `Full Arch mirror index done: ${result.scanned} scanned, ${result.skipped} skipped, ${result.failed} failed`,
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
          const response = await this.httpService.axiosRef({
            url: candidate.downloadUrl,
            method: 'GET',
            responseType: 'arraybuffer',
          });
          await writeFile(downloadPath, Buffer.from(response.data, 'binary'));
        } catch (err: unknown) {
          this.logger.warn(`Failed to download ${candidate.filename}: ${errorMessage(err)}`);
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
      this.logger.debug(`Done pulling database of ${repo}`);
      return {
        path: join(repoDir, `${repo}.files`),
        name: repo,
        workDir: repoDir,
      };
    } catch (err: unknown) {
      this.logger.error(errorMessage(err));
      return null;
    }
  }

  async parsePacmanDatabases(databases: Array<RepoWorkDir | null>): Promise<ParsedPackage[]> {
    this.logger.debug('Started extracting databases...');
    const workDirsPromises: PromiseSettledResult<RepoWorkDir>[] = await Promise.allSettled(
      databases.map(async (repo): Promise<RepoWorkDir> => {
        try {
          if (!repo || !repo.path) throw new Error('Database entry has no path');
          const workDir = repo.path.replace(/\/[^/]+\.files$/, '');

          this.logger.debug(`Unpacking database ${repo.path}`);
          await extractPacmanDatabase(repo.path, workDir);
          return { path: workDir, name: repo.name, workDir };
        } catch (err: unknown) {
          this.logger.error(errorMessage(err));
          throw err;
        }
      }),
    );
    this.logger.debug('Done extracting databases');

    const currentPackageVersions: ParsedPackage[] = [];
    const actualWorkDirs: Array<RepoWorkDir | null> = workDirsPromises.map((workDir) =>
      workDir.status === 'fulfilled' ? workDir.value : null,
    );

    this.logger.debug('Started parsing databases...');
    for (const dir of actualWorkDirs) {
      if (!dir || !dir.path) {
        this.logger.warn('Skipping null or invalid work directory');
        continue;
      }
      const dirPath = dir.path;

      try {
        const currentPathRegex = `/${dir.path}/`;
        const allPkgDirs: string[] = await listPackageDirs(dir.path);
        this.logger.debug(`Found ${allPkgDirs.length} package directories in ${dir.path}`);

        const relevantFiles = allPkgDirs.map((pkgDir) => {
          const pkg = pkgDir.replace(new RegExp(currentPathRegex), '');
          return {
            descFile: join(dir.path, pkg, 'desc'),
            filesFile: join(dir.path, pkg, 'files'),
            repo: dir.name,
          };
        });

        // Process files in batches, yielding to the event loop periodically so
        // the API stays responsive during a full mirror parse.
        const batchSize = 100;
        const yieldEveryBatches = 5;
        for (let i = 0; i < relevantFiles.length; i += batchSize) {
          const batch = relevantFiles.slice(i, i + batchSize);

          for (const file of batch) {
            try {
              const currentPackageVersion: Partial<ParsedPackage> = await parsePackageDesc(file.descFile);

              // Only process packages that have valid metadata
              if (currentPackageVersion && Object.keys(currentPackageVersion).length > 0) {
                if (!currentPackageVersion.metaData) {
                  currentPackageVersion.metaData = {
                    buildDate: '',
                    filename: '',
                  };
                }
                currentPackageVersion.metaData.soNameList = await parsePackageFiles(file.filesFile);
                currentPackageVersion.repoName = file.repo;
                currentPackageVersions.push(currentPackageVersion as ParsedPackage);
              }
            } catch (fileErr: unknown) {
              this.logger.warn(`Error processing package files ${file.descFile}: ${errorMessage(fileErr)}`);
            }
          }

          if (i % (batchSize * yieldEveryBatches) === 0) {
            await new Promise((resolve) => setImmediate(resolve));
          }
        }
      } catch (dirErr: unknown) {
        this.logger.error(`Error processing directory ${dirPath}: ${errorMessage(dirErr)}`);
      }
    }

    await this.cleanUp(actualWorkDirs.filter((dir): dir is RepoWorkDir => dir !== null).map((dir) => dir.workDir));
    this.logger.debug('Done parsing databases');
    this.logger.log(`Total packages processed: ${currentPackageVersions.length}`);

    return currentPackageVersions;
  }

  private async determineChangedPackages(
    currentArchVersions: ParsedPackage[],
    settings: RepoSettings,
  ): Promise<ArchlinuxPackage[]> {
    if (currentArchVersions.length === 0) {
      this.logger.error('No packages found in databases');
      return [];
    }

    const result: ArchlinuxPackage[] = [];

    // Resolve every Arch package in one query + one bulk insert for the missing,
    // instead of N serialized per-package round-trips through packageMutex.
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

      // If we update records, don't
      if (!settings.regenDatabase) {
        this.logger.log(`Package ${pkg.name} has changed, updating records`);
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

    this.logger.debug(`Done determining changed packages, in total ${result.length} package(s) changed`);
    return result;
  }

  async cleanUp(dirs: string[]): Promise<void> {
    this.logger.log('Cleaning up...');
    for (const dir of dirs) {
      if (!dir) {
        this.logger.warn('Skipping null or empty directory in cleanup');
        continue;
      }

      try {
        // Check if directory exists before trying to remove it
        const dirStats = await stat(dir);
        if (dirStats.isDirectory()) {
          await rm(dir, { recursive: true, force: true });
          this.logger.debug(`Cleaned up directory: ${dir}`);
        } else {
          this.logger.warn(`Path is not a directory, skipping: ${dir}`);
        }
      } catch (err: unknown) {
        if (errorCode(err) === 'ENOENT') {
          this.logger.debug(`Directory already removed or doesn't exist: ${dir}`);
        } else {
          this.logger.error(`Failed to cleanup directory ${dir}: ${errorMessage(err)}`);
        }
      }
    }
  }
}
