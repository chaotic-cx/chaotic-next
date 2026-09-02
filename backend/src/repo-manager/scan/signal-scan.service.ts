import { Package, Repo } from '../../builder/builder.entity';
import { TriggerType } from '../../interfaces/repo-manager';
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
  isPackageMetadata,
  latestAnalysisByKey,
  MIN_PROVIDED_SONAMES,
  pkgTypeOf,
  triggerTypeOf,
} from '../signal';
import { latestAnalysesByPackage } from './latest-analyses';
import { loadRuntimeVersions } from './runtime-versions';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { In, Repository, type FindOptionsSelect } from 'typeorm';
import { mapWithConcurrency, yieldToEventLoop } from '../../utils/functions';

export interface ScanJob {
  file: string;
  pkgType: TriggerType;
  pkgId: number;
  version: string;
  isSourceCompiled?: boolean;
}

interface ScannedEntry {
  job: ScanJob;
  files: string[];
  hasCompiledCode: boolean;
  isSourceCompiled: boolean;
}

const ANALYSIS_SAVE_BATCH = 500;
const PROGRESS_STEPS = 10;
const YIELD_EVERY = 10;

const analysisKey = (analysis: { pkgType: string; pkgId: number; version: string }): string =>
  `${analysis.pkgType}|${analysis.pkgId}|${analysis.version}`;

export type ImportedAnalysis = Pick<PackageElfAnalysis, 'pkgType' | 'pkgId' | 'version'> & Partial<PackageElfAnalysis>;
type BrokenFlagUpdate = Pick<PackageElfAnalysis, 'id' | 'pkgType' | 'pkgId' | 'version' | 'broken' | 'brokenReasons'>;
type PluginOfUpdate = Pick<PackageElfAnalysis, 'id' | 'pkgType' | 'pkgId' | 'version' | 'pluginOf'>;

interface OwnerDirs {
  direct: Set<string>;
  ancestors: Set<string>;
  files: Set<string>;
}

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
  analysis: Pick<PackageElfAnalysis, 'directDirectories' | 'directoriesOwned' | 'files'>,
): void {
  const record = cache.dirs.get(key) ?? {
    direct: new Set<string>(),
    ancestors: new Set<string>(),
    files: new Set<string>(),
  };
  for (const dir of analysis.directDirectories) {
    addOwner(cache.index.direct, dir, key);
    record.direct.add(dir);
  }
  for (const dir of analysis.directoriesOwned) {
    addOwner(cache.index.ancestors, dir, key);
    record.ancestors.add(dir);
  }
  const ownerFiles = cache.index.keyToFiles.get(key) ?? new Set<string>();
  for (const file of analysis.files) {
    if (isPackageMetadata(file)) continue;
    ownerFiles.add(file);
    record.files.add(file);
  }
  cache.index.keyToFiles.set(key, ownerFiles);
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
    @InjectPinoLogger(SignalScanService.name) private readonly pino: PinoLogger,
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
    const scanned = (
      await mapWithConcurrency(
        jobs,
        async (job): Promise<ScannedEntry | null> => {
          const analysis = await this.scanOne(job);
          if (!analysis) return null;
          const hasCompiledCode = analysis.providedSonames.length > 0 || analysis.neededSonames.length > 0;
          const isSourceCompiled = job.isSourceCompiled ?? false;
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
              providedVersionNodes: analysis.providedVersionNodes,
              neededVersionNodes: analysis.neededVersionNodes,
              vtables: analysis.vtables,
              directoriesOwned: analysis.directoriesOwned,
              directDirectories: analysis.directDirectories,
              pluginOf: [],
              hasCompiledCode: analysis.hasCompiledCode,
              isSourceCompiled,
            },
            ['pkgType', 'pkgId', 'version'],
          );
          return { job, files: analysis.files, hasCompiledCode, isSourceCompiled };
        },
        workers,
      )
    ).filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    // Pass 2: bring the cached directory index up to date with this batch
    // (incremental, not a full-table rebuild) and derive pluginOf
    // deterministically. Without this the result depended on worker
    // scheduling under concurrency > 1.
    await this.updateDirectoryIndex(scanned.map(({ job }) => ({ pkgType: pkgTypeOf(job.pkgType), pkgId: job.pkgId })));
    const index = await this.getDirectoryIndex();
    const pkgnameById = await this.loadPkgnameMap(
      scanned.map(({ job }) => ({ pkgType: job.pkgType, pkgId: job.pkgId })),
    );
    for (const { job, files, hasCompiledCode, isSourceCompiled } of scanned) {
      const pluginOf = derivePluginOf(files, index, {
        consumerPkgname: pkgnameById.get(job.pkgId) ?? null,
        hasCompiledCode,
        isSourceCompiled,
      });
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
        this.pino.warn(warning);
      }
      return buildAnalysis({ version: job.version, ...result });
    } catch (err) {
      this.pino.warn({ err, file: job.file }, 'Failed to scan package');
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
    await this.deleteSkippedPackageAnalyses(skipIds);

    // Only the columns needed to judge brokenness are fetched; the full rows
    // carry heavy `files`/symbol/vtable JSONB that is never rewritten here.
    const candidates = await this.loadBrokenCandidates(filter);
    // Only the latest version per package matters for repo operations — old
    // versions that were broken for stale sonames must not be recomputed or
    // shown in the broken table.
    const latest = latestAnalysisByKey(candidates, (a) => `${a.pkgType}:${a.pkgId}`);
    const notSkipped = [...latest.values()].filter((analysis) => !skipIds.has(analysis.pkgId));

    if (notSkipped.length === 0) return;

    const [provided, runtimes] = await Promise.all([
      this.getProvidedSonames(),
      loadRuntimeVersions(this.archlinuxPackageRepository),
    ]);
    this.pino.debug({ providedSonames: provided.size, runtimes }, 'Broken-deps context');

    let changed = 0;
    const checkSonames = provided.size >= MIN_PROVIDED_SONAMES;
    const updates: BrokenFlagUpdate[] = [];
    const total = notSkipped.length;
    const step = Math.max(1, Math.floor(total / PROGRESS_STEPS));
    for (let i = 0; i < total; i++) {
      if (i % YIELD_EVERY === 0) await yieldToEventLoop();
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
        this.pino.debug({ current: i + 1, total }, 'Recomputed broken flags');
      }
    }

    await saveInBatches(this.analysisRepository, updates);
    const skipped = latest.size - notSkipped.length;
    this.pino.info({ total: notSkipped.length, broken: changed, skipped }, 'Recomputed broken flags for analyses');
  }

  private async loadSkipSignalScanIds(): Promise<Set<number>> {
    const rows = await this.packageRepository.find({
      where: { skipSignalScan: true },
      select: { id: true },
    });
    return new Set(rows.map((row) => row.id));
  }

  /** Analyses of skip-signal-scanned packages are stale by definition; drop them. */
  private async deleteSkippedPackageAnalyses(skipIds: Set<number>): Promise<void> {
    if (skipIds.size === 0) return;
    await this.analysisRepository.delete({
      pkgType: pkgTypeOf(TriggerType.CHAOTIC),
      pkgId: In([...skipIds]),
    });
  }

  private async loadBrokenCandidates(
    filter: { pkgType: TriggerType; pkgId: number }[] | undefined,
  ): Promise<
    Pick<PackageElfAnalysis, 'id' | 'pkgType' | 'pkgId' | 'version' | 'neededSonames' | 'providedSonames' | 'files'>[]
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
      select: { pkgId: true, pkgType: true, directDirectories: true, directoriesOwned: true, files: true },
    });
    const cache: DirectoryCache = {
      index: { direct: new Map(), ancestors: new Map(), keyToPkgname: new Map(), keyToFiles: new Map() },
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

  /** Names of the given packages, fetched per namespace in parallel. */
  private async findPkgnameRows(
    archIds: number[],
    chaoticIds: number[],
  ): Promise<{ archPkgs: { id: number; pkgname: string }[]; chaoticPkgs: { id: number; pkgname: string }[] }> {
    const [archPkgs, chaoticPkgs] = await Promise.all([
      archIds.length
        ? this.archlinuxPackageRepository.find({ where: { id: In(archIds) }, select: { id: true, pkgname: true } })
        : Promise.resolve([]),
      chaoticIds.length
        ? this.packageRepository.find({ where: { id: In(chaoticIds) }, select: { id: true, pkgname: true } })
        : Promise.resolve([]),
    ]);
    return { archPkgs, chaoticPkgs };
  }

  private async buildKeyToPkgname(archIds: number[], chaoticIds: number[]): Promise<Map<string, string>> {
    const { archPkgs, chaoticPkgs } = await this.findPkgnameRows(archIds, chaoticIds);
    const map = new Map<string, string>();
    for (const pkg of archPkgs) map.set(encodeOwnerKey(TriggerType.ARCH, pkg.id), pkg.pkgname);
    for (const pkg of chaoticPkgs) map.set(encodeOwnerKey(TriggerType.CHAOTIC, pkg.id), pkg.pkgname);
    return map;
  }

  private async updateDirectoryIndex(packages: Pick<PackageElfAnalysis, 'pkgType' | 'pkgId'>[]): Promise<void> {
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
        const ownerFiles = cache.index.keyToFiles.get(key);
        if (ownerFiles) for (const file of record.files) ownerFiles.delete(file);
        if (ownerFiles?.size === 0) cache.index.keyToFiles.delete(key);
        cache.dirs.delete(key);
      }
    }

    const archIds = packages.filter((p) => p.pkgType === ARCH_PKG_TYPE).map((p) => p.pkgId);
    const chaoticIds = packages.filter((p) => p.pkgType === CHAOTIC_PKG_TYPE).map((p) => p.pkgId);
    const select = { pkgId: true, directDirectories: true, directoriesOwned: true, files: true };
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

  private async loadPkgnameMap(entries: { pkgType: TriggerType; pkgId: number }[]): Promise<Map<number, string>> {
    const { archPkgs, chaoticPkgs } = await this.findPkgnameRows(
      entries.filter((e) => e.pkgType === TriggerType.ARCH).map((e) => e.pkgId),
      entries.filter((e) => e.pkgType === TriggerType.CHAOTIC).map((e) => e.pkgId),
    );
    const map = new Map<number, string>();
    for (const pkg of [...archPkgs, ...chaoticPkgs]) map.set(pkg.id, pkg.pkgname);
    return map;
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
    // Rebuild the directory index from the DB: it incrementally accumulates
    // owner contributions, and rows the importer replaced or removed would
    // otherwise linger as stale owners on shared directories forever.
    this.directoryCache = null;
    await this.updateDirectoryIndex(analyses);
    // pluginOf depends on the directory index of OTHER packages: an import that
    // extends one owner (kwin gaining plugin directories) must re-derive every
    // stored consumer of the touched namespaces, not only the changed rows.
    const touched = [...new Set(analyses.map((a) => a.pkgType))];
    for (const pkgType of touched) {
      await this.recomputePluginOfPkgType(pkgType);
    }
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
    analyses: Pick<PackageElfAnalysis, 'pkgType' | 'pkgId' | 'version'>[],
  ): Promise<void> {
    if (analyses.length === 0) return;
    const index = await this.getDirectoryIndex();
    const pkgnameById = await this.loadPkgnameMap(
      analyses.map((a) => ({ pkgType: triggerTypeOf(a.pkgType), pkgId: a.pkgId })),
    );

    const pkgIds = [...new Set(analyses.map((a) => a.pkgId))];
    // Only `files` is needed to derive pluginOf; the full rows carry heavy
    // symbol/vtable JSONB that is never rewritten here.
    const rows = await this.analysisRepository.find({
      where: { pkgId: In(pkgIds) },
      select: {
        id: true,
        pkgType: true,
        pkgId: true,
        version: true,
        files: true,
        providedSonames: true,
        neededSonames: true,
        isSourceCompiled: true,
      },
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
      if (i % YIELD_EVERY === 0) await yieldToEventLoop();
      if (!analysis) continue;
      const hasCompiledCode = analysis.providedSonames.length > 0 || analysis.neededSonames.length > 0;
      const pluginOf = derivePluginOf(analysis.files, index, {
        consumerPkgname: pkgnameById.get(pkgId) ?? null,
        hasCompiledCode,
        isSourceCompiled: analysis.isSourceCompiled,
      });
      toSave.push({ id: analysis.id, pkgType, pkgId, version, pluginOf });
      if (i % step === 0) {
        this.pino.debug({ current: i, total }, 'Derived pluginOf');
      }
    }

    await saveInBatches(this.analysisRepository, toSave, ANALYSIS_SAVE_BATCH);
    this.pino.debug({ count: toSave.length }, 'Derived pluginOf');
  }
}
