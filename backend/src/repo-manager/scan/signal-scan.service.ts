import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { FindOptionsSelect } from 'typeorm';
import { In, Repository } from 'typeorm';
import { Package, Repo } from '../../builder/builder.entity';
import { TriggerType } from '../../interfaces/repo-manager';
import { errorMessage } from '../../utils/functions';
import { scanArchive } from '../offline/scan-archive';
import { ArchlinuxPackage, PackageElfAnalysis, type PackageElfPkgType } from '../repo-manager.entity';
import { saveInBatches } from '../save';
import {
  ARCH_PKG_TYPE,
  buildAnalysis,
  CHAOTIC_PKG_TYPE,
  derivePluginOf,
  DirectoryIndex,
  encodeOwnerKey,
  findBrokenDependencies,
  formatBrokenDependency,
  MIN_PROVIDED_SONAMES,
  pkgTypeOf,
  triggerTypeOf,
} from '../signal';
import { latestAnalysesByPackage } from './latest-analyses';
import { loadRuntimeVersions } from './runtime-versions';

/** A package archive job for the scanner. */
export interface ScanJob {
  file: string;
  pkgType: TriggerType;
  pkgId: number;
  version: string;
}

const ANALYSIS_SAVE_BATCH = 500;

/** Roughly how many progress log lines a long recompute should emit. */
const PROGRESS_STEPS = 10;

export const analysisKey = (analysis: { pkgType: string; pkgId: number; version: string }): string =>
  `${analysis.pkgType}|${analysis.pkgId}|${analysis.version}`;

/** An upserted analysis carrying at least its identity; the seed importer's unit. */
export type ImportedAnalysis = Pick<PackageElfAnalysis, 'pkgType' | 'pkgId' | 'version'> & Partial<PackageElfAnalysis>;

/** The columns recomputeBroken rewrites; the heavy JSONB columns stay untouched. */
type BrokenFlagUpdate = Pick<PackageElfAnalysis, 'id' | 'pkgType' | 'pkgId' | 'version' | 'broken' | 'brokenReasons'>;

/** The columns recomputePluginOf rewrites. */
type PluginOfUpdate = Pick<PackageElfAnalysis, 'id' | 'pkgType' | 'pkgId' | 'version' | 'pluginOf'>;

/** Directories contributed to the directory index by a single owner key. */
interface OwnerDirs {
  direct: Set<string>;
  ancestors: Set<string>;
}

/** The directory index plus the reverse map needed to update it incrementally. */
interface DirectoryCache {
  index: DirectoryIndex;
  /** owner key -> the directories it currently contributes, so incremental
   * updates can drop a package's old directories before re-adding. */
  dirs: Map<string, OwnerDirs>;
}

function addOwner(map: Map<string, string[]>, dir: string, key: string): void {
  const owners = map.get(dir);
  if (owners) {
    if (!owners.includes(key)) owners.push(key);
  } else {
    map.set(dir, [key]);
  }
}

function removeOwner(map: Map<string, string[]>, dir: string, key: string): void {
  const owners = map.get(dir);
  if (!owners) return;
  const next = owners.filter((owner) => owner !== key);
  if (next.length === 0) map.delete(dir);
  else map.set(dir, next);
}

function applyOwnerDirs(
  cache: DirectoryCache,
  key: string,
  analysis: Pick<PackageElfAnalysis, 'directDirectories' | 'directoriesOwned'>,
): void {
  const record = cache.dirs.get(key) ?? { direct: new Set<string>(), ancestors: new Set<string>() };
  for (const dir of analysis.directDirectories) {
    addOwner(cache.index.direct, dir, key);
    record.direct.add(dir);
  }
  for (const dir of analysis.directoriesOwned) {
    addOwner(cache.index.ancestors, dir, key);
    record.ancestors.add(dir);
  }
  cache.dirs.set(key, record);
}

/**
 * Scans package archives with bsdtar/readelf/nm and persists the ELF analysis.
 * Extraction covers executables too (via their `-tvf` mode bits), so their
 * DT_NEEDED feeds dependency detection; see scanPackages for the two-pass
 * ordering that keeps pluginOf deterministic.
 */
@Injectable()
export class SignalScanService {
  private readonly logger = new Logger(SignalScanService.name);
  private directoryCache: DirectoryCache | null = null;

  constructor(
    @InjectRepository(PackageElfAnalysis)
    private readonly analysisRepository: Repository<PackageElfAnalysis>,
    @InjectRepository(ArchlinuxPackage)
    private readonly archlinuxPackageRepository: Repository<ArchlinuxPackage>,
    @InjectRepository(Package)
    private readonly packageRepository: Repository<Package>,
    @InjectRepository(Repo)
    private readonly repoRepository: Repository<Repo>,
  ) {}

  /**
   * Scan a set of package archives and persist their analyses. Plugin
   * relationships are resolved against the stored directory index (loaded
   * lazily and updated incrementally across scans). When `concurrency > 1` the
   * scan workers run in parallel — used for one-off full-repo indexing, while
   * the regular incremental path keeps the default of 1 to stay gentle.
   */
  async scanPackages(jobs: ScanJob[], concurrency = 1): Promise<void> {
    if (jobs.length === 0) return;
    const workers = Math.max(1, Math.min(concurrency, jobs.length));

    // Pass 1: scan and persist analyses (pluginOf is left empty; it depends on
    // the directory index reflecting the whole batch). The directory index is
    // rebuilt per package so it is current before pass 2.
    const scanned: { job: ScanJob; files: string[] }[] = [];
    let cursor = 0;
    const worker = async (): Promise<void> => {
      while (cursor < jobs.length) {
        const job = jobs[cursor++];
        const analysis = await this.scanOne(job);
        if (!analysis) continue;
        scanned.push({ job, files: analysis.files });

        await this.analysisRepository.upsert(
          {
            pkgType: pkgTypeOf(job.pkgType),
            pkgId: job.pkgId,
            version: job.version,
            files: analysis.files,
            neededSonames: analysis.neededSonames,
            providedSonames: analysis.providedSonames,
            importedSymbols: analysis.importedSymbols,
            exportedSymbols: analysis.exportedSymbols,
            vtables: analysis.vtables,
            directoriesOwned: analysis.directoriesOwned,
            directDirectories: analysis.directDirectories,
            pluginOf: [],
          },
          ['pkgType', 'pkgId', 'version'],
        );
      }
    };

    await Promise.all(Array.from({ length: workers }, () => worker()));

    // Pass 2: bring the cached directory index up to date with this batch
    // (incremental, not a full-table rebuild) and derive pluginOf
    // deterministically. Without this the result depended on worker
    // scheduling under concurrency > 1.
    await this.updateDirectoryIndex(scanned.map(({ job }) => ({ pkgType: pkgTypeOf(job.pkgType), pkgId: job.pkgId })));
    const index = await this.getDirectoryIndex();
    for (const { job, files } of scanned) {
      const pluginOf = derivePluginOf(files, index);
      await this.analysisRepository.update(
        { pkgType: pkgTypeOf(job.pkgType), pkgId: job.pkgId, version: job.version },
        { pluginOf },
      );
    }

    // Recompute the broken flags of every scanned Chaotic package against the
    // now complete provided-soname index (a newly scanned package may provide
    // a soname another scanned package was flagged missing for). Arch jobs are
    // excluded: Arch is reference data and never judged broken.
    await this.recomputeBroken(
      jobs
        .filter((job) => job.pkgType === TriggerType.CHAOTIC)
        .map((job) => ({ pkgType: job.pkgType, pkgId: job.pkgId })),
    );
  }

  private async scanOne(job: ScanJob): Promise<ReturnType<typeof buildAnalysis> | null> {
    try {
      const result = await scanArchive(job.file);
      if (!result) return null;
      for (const warning of result.warnings) {
        this.logger.warn(warning, 'SignalScanService');
      }
      return buildAnalysis({ version: job.version, ...result });
    } catch (err) {
      this.logger.warn(`Failed to scan ${job.file}: ${errorMessage(err)}`, 'SignalScanService');
      return null;
    }
  }

  private async getProvidedSonames(): Promise<Set<string>> {
    const latest = await latestAnalysesByPackage(this.analysisRepository);
    const set = new Set<string>();
    for (const analysis of latest.values()) {
      for (const soname of analysis.providedSonames) set.add(soname);
    }
    return set;
  }

  /**
   * Recompute `broken`/`brokenReasons` for analyses against the current
   * provided-soname index and runtime versions, optionally restricted to a set
   * of packages. Runs after every scan so the flag reflects the latest state.
   * Arch packages (pkgType '0') are reference data only — Arch itself is never
   * judged broken, so an unfiltered recompute covers Chaotic only.
   */
  async recomputeBroken(filter?: { pkgType: TriggerType; pkgId: number }[]): Promise<void> {
    const skipIds = await this.loadSkipSignalScanIds();
    await this.clearSkipFlags(skipIds);

    // Only the columns needed to judge brokenness are fetched; the full rows
    // carry heavy `files`/symbol/vtable JSONB that is never rewritten here.
    const candidates = await this.loadBrokenCandidates(filter);
    const notSkipped = candidates.filter((analysis) => !skipIds.has(analysis.pkgId));

    if (notSkipped.length === 0) return;

    const [provided, runtimes] = await Promise.all([
      this.getProvidedSonames(),
      loadRuntimeVersions(this.archlinuxPackageRepository),
    ]);
    this.logger.debug(
      `Broken-deps context: ${provided.size} provided sonames, runtimes ${JSON.stringify(runtimes)}`,
      'SignalScanService',
    );

    let changed = 0;
    const checkSonames = provided.size >= MIN_PROVIDED_SONAMES;
    const updates: BrokenFlagUpdate[] = [];
    const total = notSkipped.length;
    const step = Math.max(1, Math.floor(total / PROGRESS_STEPS));
    for (let i = 0; i < total; i++) {
      const analysis = notSkipped[i];
      const reasons = findBrokenDependencies({
        neededSonames: analysis.neededSonames,
        files: analysis.files,
        providedSonames: provided,
        runtimes,
        checkSonames,
        selfProvidedSonames: analysis.providedSonames,
      }).map(formatBrokenDependency);
      const broken = reasons.length > 0;
      if (broken) changed++;
      updates.push({
        id: analysis.id,
        pkgType: analysis.pkgType,
        pkgId: analysis.pkgId,
        version: analysis.version,
        broken,
        brokenReasons: reasons,
      });
      if ((i + 1) % step === 0) {
        this.logger.debug(`Recomputed broken flags ${i + 1}/${total}`, 'SignalScanService');
      }
    }

    await saveInBatches(this.analysisRepository, updates);
    const skipped = candidates.length - notSkipped.length;
    this.logger.log(
      `Recomputed broken flags for ${notSkipped.length} analyses (${changed} broken, ${skipped} skip-signal-scanned)`,
      'SignalScanService',
    );
  }

  private async loadSkipSignalScanIds(): Promise<Set<number>> {
    const rows = await this.packageRepository.find({
      where: { skipSignalScan: true },
      select: { id: true },
    });
    return new Set(rows.map((row) => row.id));
  }

  private async clearSkipFlags(skipIds: Set<number>): Promise<void> {
    if (skipIds.size === 0) return;
    await this.analysisRepository.update(
      { pkgType: pkgTypeOf(TriggerType.CHAOTIC), pkgId: In([...skipIds]) },
      { broken: false, brokenReasons: [] },
    );
  }

  private async loadBrokenCandidates(
    filter: { pkgType: TriggerType; pkgId: number }[] | undefined,
  ): Promise<
    Array<
      Pick<PackageElfAnalysis, 'id' | 'pkgType' | 'pkgId' | 'version' | 'neededSonames' | 'providedSonames' | 'files'>
    >
  > {
    const select = {
      id: true,
      pkgType: true,
      pkgId: true,
      version: true,
      neededSonames: true,
      providedSonames: true,
      files: true,
    };
    if (filter === undefined) {
      return this.analysisRepository.find({ where: { pkgType: CHAOTIC_PKG_TYPE }, select });
    }
    const chaoticEntries = filter.filter((entry) => entry.pkgType === TriggerType.CHAOTIC);
    if (chaoticEntries.length === 0) return [];
    return this.analysisRepository.find({
      where: chaoticEntries.map((entry) => ({ pkgType: pkgTypeOf(entry.pkgType), pkgId: entry.pkgId })),
      select,
    });
  }

  async getDirectoryIndex(): Promise<DirectoryIndex> {
    return (await this.loadDirectoryCache()).index;
  }

  private async loadDirectoryCache(): Promise<DirectoryCache> {
    if (this.directoryCache) return this.directoryCache;
    const analyses = await this.analysisRepository.find({
      select: { pkgId: true, pkgType: true, directDirectories: true, directoriesOwned: true },
    });
    const cache: DirectoryCache = {
      index: { direct: new Map(), ancestors: new Map(), keyToPkgname: new Map() },
      dirs: new Map(),
    };
    const archIds: number[] = [];
    const chaoticIds: number[] = [];
    for (const analysis of analyses) {
      const triggerType = triggerTypeOf(analysis.pkgType);
      const key = encodeOwnerKey(triggerType, analysis.pkgId);
      (triggerType === TriggerType.ARCH ? archIds : chaoticIds).push(analysis.pkgId);
      applyOwnerDirs(cache, key, analysis);
    }
    const keyToPkgname = await this.buildKeyToPkgname(archIds, chaoticIds);
    for (const [key, name] of keyToPkgname) cache.index.keyToPkgname.set(key, name);
    this.directoryCache = cache;
    return cache;
  }

  private async buildKeyToPkgname(archIds: number[], chaoticIds: number[]): Promise<Map<string, string>> {
    const [archPkgs, chaoticPkgs] = await Promise.all([
      archIds.length
        ? this.archlinuxPackageRepository.find({ where: { id: In(archIds) }, select: { id: true, pkgname: true } })
        : Promise.resolve([]),
      chaoticIds.length
        ? this.packageRepository.find({ where: { id: In(chaoticIds) }, select: { id: true, pkgname: true } })
        : Promise.resolve([]),
    ]);
    const map = new Map<string, string>();
    for (const pkg of archPkgs) map.set(encodeOwnerKey(TriggerType.ARCH, pkg.id), pkg.pkgname);
    for (const pkg of chaoticPkgs) map.set(encodeOwnerKey(TriggerType.CHAOTIC, pkg.id), pkg.pkgname);
    return map;
  }

  private async updateDirectoryIndex(packages: Array<Pick<PackageElfAnalysis, 'pkgType' | 'pkgId'>>): Promise<void> {
    if (packages.length === 0) return;
    const cache = await this.loadDirectoryCache();

    // Drop each affected key's previous contribution so a re-scan of the same
    // package cannot leave stale directories behind.
    for (const pkg of packages) {
      const triggerType = triggerTypeOf(pkg.pkgType);
      const key = encodeOwnerKey(triggerType, pkg.pkgId);
      const record = cache.dirs.get(key);
      if (record) {
        for (const dir of record.direct) removeOwner(cache.index.direct, dir, key);
        for (const dir of record.ancestors) removeOwner(cache.index.ancestors, dir, key);
        cache.dirs.delete(key);
      }
    }

    const archIds = packages.filter((p) => p.pkgType === ARCH_PKG_TYPE).map((p) => p.pkgId);
    const chaoticIds = packages.filter((p) => p.pkgType === CHAOTIC_PKG_TYPE).map((p) => p.pkgId);
    const select = { pkgId: true, directDirectories: true, directoriesOwned: true };
    const [archRows, chaoticRows] = await Promise.all([
      this.findAnalyses(ARCH_PKG_TYPE, archIds, select),
      this.findAnalyses(CHAOTIC_PKG_TYPE, chaoticIds, select),
    ]);
    for (const row of archRows) applyOwnerDirs(cache, encodeOwnerKey(TriggerType.ARCH, row.pkgId), row);
    for (const row of chaoticRows) applyOwnerDirs(cache, encodeOwnerKey(TriggerType.CHAOTIC, row.pkgId), row);

    // Resolve pkgnames for any key introduced by this update (new package ids
    // only appear via import/scan; existing keys already have their mapping).
    const missingArch = archIds.filter((id) => !cache.index.keyToPkgname.has(encodeOwnerKey(TriggerType.ARCH, id)));
    const missingChaotic = chaoticIds.filter(
      (id) => !cache.index.keyToPkgname.has(encodeOwnerKey(TriggerType.CHAOTIC, id)),
    );
    const pkgnames = await this.buildKeyToPkgname(missingArch, missingChaotic);
    for (const [key, name] of pkgnames) cache.index.keyToPkgname.set(key, name);
  }

  private findAnalyses(
    pkgType: PackageElfPkgType,
    ids: number[],
    select: FindOptionsSelect<PackageElfAnalysis>,
  ): Promise<PackageElfAnalysis[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.analysisRepository.find({ where: { pkgType, pkgId: In(ids) }, select });
  }

  invalidateDirectoryIndex(): void {
    this.directoryCache = null;
  }

  /**
   * Refresh derived state after analyses were upserted out-of-band by the seed
   * importer: directory index (incremental), pluginOf, and the broken flags of
   * the imported Chaotic packages.
   */
  async refreshAfterImport(analyses: ImportedAnalysis[]): Promise<void> {
    await this.updateDirectoryIndex(analyses);
    await this.recomputePluginOf(analyses);
    await this.recomputeBroken(
      analyses
        .filter((a) => a.pkgType === CHAOTIC_PKG_TYPE)
        .map((a) => ({ pkgType: TriggerType.CHAOTIC, pkgId: a.pkgId })),
    );
  }

  /**
   * Derive pluginOf for every stored analysis of one pkg namespace, then let
   * callers recompute broken flags separately (see derive-seed.script.ts).
   */
  async recomputePluginOfPkgType(pkgType: PackageElfPkgType): Promise<void> {
    const analyses = await this.analysisRepository.find({
      where: { pkgType },
      select: { pkgType: true, pkgId: true, version: true },
    });
    await this.recomputePluginOf(analyses);
  }

  private async recomputePluginOf(
    analyses: Array<Pick<PackageElfAnalysis, 'pkgType' | 'pkgId' | 'version'>>,
  ): Promise<void> {
    if (analyses.length === 0) return;
    const index = await this.getDirectoryIndex();

    const pkgIds = [...new Set(analyses.map((a) => a.pkgId))];
    // Only `files` is needed to derive pluginOf; the full rows carry heavy
    // symbol/vtable JSONB that is never rewritten here.
    const rows = await this.analysisRepository.find({
      where: { pkgId: In(pkgIds) },
      select: { id: true, pkgType: true, pkgId: true, version: true, files: true },
    });

    const byIdentity = new Map<string, PackageElfAnalysis>();
    for (const row of rows) {
      byIdentity.set(analysisKey(row), row);
    }

    const toSave: PluginOfUpdate[] = [];
    const total = analyses.length;
    const step = Math.max(1, Math.floor(total / PROGRESS_STEPS));
    let i = 0;
    for (const { pkgType, pkgId, version } of analyses) {
      const analysis = byIdentity.get(analysisKey({ pkgType, pkgId, version }));
      i++;
      if (!analysis) continue;
      const pluginOf = derivePluginOf(analysis.files, index);
      toSave.push({ id: analysis.id, pkgType, pkgId, version, pluginOf });
      if (i % step === 0) {
        this.logger.debug(`Derived pluginOf ${i}/${total}`, 'SignalScanService');
      }
    }

    await saveInBatches(this.analysisRepository, toSave, ANALYSIS_SAVE_BATCH);
    this.logger.debug(`Derived pluginOf for ${toSave.length} analyses`, 'SignalScanService');
  }
}
