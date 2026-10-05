import { In, type FindOptionsSelect, type Repository } from 'typeorm';
import { type Package } from '../../builder/builder.entity';
import { TriggerType } from '../../interfaces/repo-manager';
import { yieldToEventLoop } from '../../utils/functions';
import { type ComputeLogger } from '../compute/compute-logger';
import { type ArchlinuxPackage, type PackageElfAnalysis, type PackageElfPkgType } from '../repo-manager.entity';
import { saveInBatches } from '../save';
import {
  ARCH_PKG_TYPE,
  CHAOTIC_PKG_TYPE,
  collectPluginCandidates,
  decodeOwnerKey,
  derivePluginOf,
  type DirectoryIndex,
  encodeOwnerKey,
  findBrokenDependencies,
  formatBrokenDependency,
  isPackageMetadata,
  latestAnalysisByKey,
  MIN_PROVIDED_SONAMES,
  pkgTypeOf,
  triggerTypeOf,
} from '../signal';
import { latestActiveAnalysesByPackage } from './latest-analyses';
import { loadRuntimeVersions } from './runtime-versions';

export interface ScannedPackage {
  pkgType: TriggerType;
  pkgId: number;
  version: string;
  hasCompiledCode: boolean;
  isSourceCompiled: boolean;
}

export interface BrokenFilterEntry {
  pkgType: TriggerType;
  pkgId: number;
}

const ANALYSIS_SAVE_BATCH = 500;
// Each batch loads the file lists of its analyses into memory.
const PLUGIN_OF_BATCH_SIZE = 200;
const PROGRESS_STEPS = 10;
const YIELD_EVERY = 10;

export type ImportedAnalysis = Pick<PackageElfAnalysis, 'pkgType' | 'pkgId' | 'version'>;
type BrokenFlagUpdate = Pick<
  PackageElfAnalysis,
  'id' | 'pkgType' | 'pkgId' | 'version' | 'broken' | 'brokenReasons' | 'brokenSince'
>;
type BrokenCandidate = Pick<
  PackageElfAnalysis,
  'id' | 'pkgType' | 'pkgId' | 'version' | 'neededSonames' | 'providedSonames' | 'files' | 'scannedAt' | 'brokenSince'
>;

export interface RecomputeBrokenOptions {
  // The analyses come from a new scan, so a broken result means broken as built.
  freshlyScanned?: boolean;
}

/**
 * Start of the broken state after a check. A fresh scan dates it to the scan,
 * so that only a later dependency change counts as a break of a working package.
 */
function brokenSinceAfterCheck(
  analysis: BrokenCandidate,
  broken: boolean,
  now: Date,
  options: RecomputeBrokenOptions,
): Date | null {
  if (!broken) return null;

  if (options.freshlyScanned) return analysis.scannedAt;

  return analysis.brokenSince ?? now;
}

type PluginOfUpdate = Pick<PackageElfAnalysis, 'id' | 'pkgType' | 'pkgId' | 'version' | 'pluginOf'>;

interface OwnerDirs {
  direct: Set<string>;
  ancestors: Set<string>;
}

interface DirectoryCache {
  index: DirectoryIndex;
  /**
   * owner key -> the directories it currently contributes, so incremental
   * updates can drop a package's old directories before re-adding.
   */
  dirs: Map<string, OwnerDirs>;
}

function addOwner(map: Map<string, string[]>, dir: string, key: string): void {
  const owners = map.get(dir);
  if (owners) {
    if (!owners.includes(key)) {
      owners.push(key);
    }
  } else {
    map.set(dir, [key]);
  }
}

function removeOwner(map: Map<string, string[]>, dir: string, key: string): void {
  const owners = map.get(dir);
  if (!owners) return;

  const next = owners.filter((owner) => owner !== key);
  if (next.length === 0) {
    map.delete(dir);
  } else {
    map.set(dir, next);
  }
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

export class SignalIndex {
  private directoryCache: DirectoryCache | null = null;

  constructor(
    private readonly analysisRepository: Repository<PackageElfAnalysis>,
    private readonly archlinuxPackageRepository: Repository<ArchlinuxPackage>,
    private readonly packageRepository: Repository<Package>,
    private readonly pino: ComputeLogger,
  ) {}

  /**
   * The index must contain the whole batch first. Else pluginOf depends on the scan order.
   */
  async refreshAfterScan(scanned: ScannedPackage[]): Promise<void> {
    if (scanned.length === 0) return;

    await this.updateDirectoryIndex(scanned.map(({ pkgType, pkgId }) => ({ pkgType: pkgTypeOf(pkgType), pkgId })));
    const pkgnameById = await this.loadPkgnameMap(scanned);
    for (const pkg of scanned) {
      const where = { pkgType: pkgTypeOf(pkg.pkgType), pkgId: pkg.pkgId, version: pkg.version };
      const row = await this.analysisRepository.findOne({ where, select: { files: true } });
      if (!row) continue;

      const pluginOf = await this.pluginOfFor(row.files, {
        consumerPkgname: pkgnameById.get(pkg.pkgId) ?? null,
        hasCompiledCode: pkg.hasCompiledCode,
        isSourceCompiled: pkg.isSourceCompiled,
      });

      await this.analysisRepository.update(where, { pluginOf });
    }

    /**
     * A newly scanned package may provide a soname another scanned package
     * was flagged missing for. Arch is reference data and never judged broken.
     */
    await this.recomputeBroken(
      scanned.filter((pkg) => pkg.pkgType === TriggerType.CHAOTIC).map(({ pkgType, pkgId }) => ({ pkgType, pkgId })),
      { freshlyScanned: true },
    );
  }

  private async getProvidedSonames(): Promise<Set<string>> {
    const latest = await latestActiveAnalysesByPackage(
      this.analysisRepository,
      this.archlinuxPackageRepository,
      this.packageRepository,
    );
    const set = new Set<string>();
    for (const { analysis } of latest.values()) {
      for (const soname of analysis.providedSonames) {
        set.add(soname);
      }
    }

    return set;
  }

  async recomputeBroken(filter?: BrokenFilterEntry[], options: RecomputeBrokenOptions = {}): Promise<void> {
    const skipIds = await this.loadSkipSignalScanIds();
    await this.deleteSkippedPackageAnalyses(skipIds);

    const candidates = await this.loadBrokenCandidates(filter);

    // Old versions must not show up in the broken table.
    const latest = latestAnalysisByKey(candidates, (a) => `${a.pkgType}:${a.pkgId}`);
    const notSkipped = [...latest.values()].filter((analysis) => !skipIds.has(analysis.pkgId));
    if (notSkipped.length === 0) return;

    const [provided, runtimes] = await Promise.all([
      this.getProvidedSonames(),
      loadRuntimeVersions(this.archlinuxPackageRepository),
    ]);
    this.pino.debug({ providedSonames: provided.size, runtimes }, 'Broken-deps context');

    let changed = 0;
    const now = new Date();
    const checkSonames = provided.size >= MIN_PROVIDED_SONAMES;
    const updates: BrokenFlagUpdate[] = [];
    const total = notSkipped.length;
    const step = Math.max(1, Math.floor(total / PROGRESS_STEPS));
    for (let i = 0; i < total; i++) {
      if (i % YIELD_EVERY === 0) {
        await yieldToEventLoop();
      }

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
      if (broken) {
        changed++;
      }

      updates.push({
        id: analysis.id,
        pkgType: analysis.pkgType,
        pkgId: analysis.pkgId,
        version: analysis.version,
        broken,
        brokenReasons: reasons,
        brokenSince: brokenSinceAfterCheck(analysis, broken, now, options),
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

  private async deleteSkippedPackageAnalyses(skipIds: Set<number>): Promise<void> {
    if (skipIds.size === 0) return;

    await this.analysisRepository.delete({
      pkgType: pkgTypeOf(TriggerType.CHAOTIC),
      pkgId: In([...skipIds]),
    });
  }

  private async loadBrokenCandidates(filter: BrokenFilterEntry[] | undefined): Promise<BrokenCandidate[]> {
    const select = {
      id: true,
      pkgType: true,
      pkgId: true,
      version: true,
      neededSonames: true,
      providedSonames: true,
      files: true,
      scannedAt: true,
      brokenSince: true,
    };

    if (filter === undefined) return this.analysisRepository.find({ where: { pkgType: CHAOTIC_PKG_TYPE }, select });

    const chaoticEntries = filter.filter((entry) => entry.pkgType === TriggerType.CHAOTIC);
    if (chaoticEntries.length === 0) return [];

    return this.analysisRepository.find({
      where: chaoticEntries.map((entry) => ({ pkgType: pkgTypeOf(entry.pkgType), pkgId: entry.pkgId })),
      select,
    });
  }

  async getDirectoryIndex(): Promise<DirectoryIndex> {
    const cache = await this.loadDirectoryCache();

    return cache.index;
  }

  /**
   * Owner files load on demand. The files of all packages need gigabytes of memory.
   */
  private async pluginOfFor(
    files: string[],
    options: { consumerPkgname: string | null; hasCompiledCode: boolean; isSourceCompiled: boolean },
  ): Promise<string[]> {
    if (!options.hasCompiledCode && !options.isSourceCompiled) return [];

    const index = await this.getDirectoryIndex();
    await this.loadOwnerFiles(index, collectPluginCandidates(files, index));
    return derivePluginOf(files, index, options);
  }

  private async loadOwnerFiles(index: DirectoryIndex, ownerKeys: Iterable<string>): Promise<void> {
    const missing = [...ownerKeys].filter((key) => !index.keyToFiles.has(key));
    if (missing.length === 0) return;

    const owners = missing.map((key) => ({ key, ...decodeOwnerKey(key) }));
    const rows = await this.analysisRepository.find({
      where: owners.map(({ pkgType, pkgId }) => ({ pkgType: pkgTypeOf(pkgType), pkgId })),
      select: { pkgType: true, pkgId: true, files: true },
    });

    for (const { key } of owners) {
      index.keyToFiles.set(key, new Set());
    }

    for (const row of rows) {
      const ownerFiles = index.keyToFiles.get(encodeOwnerKey(triggerTypeOf(row.pkgType), row.pkgId));
      for (const file of row.files) {
        if (!isPackageMetadata(file)) {
          ownerFiles?.add(file);
        }
      }
    }
  }

  private async loadDirectoryCache(): Promise<DirectoryCache> {
    if (this.directoryCache) return this.directoryCache;

    const analyses = await this.analysisRepository.find({
      select: { pkgId: true, pkgType: true, directDirectories: true, directoriesOwned: true },
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
    for (const [key, name] of keyToPkgname) {
      cache.index.keyToPkgname.set(key, name);
    }

    this.directoryCache = cache;
    return cache;
  }

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
    for (const pkg of archPkgs) {
      map.set(encodeOwnerKey(TriggerType.ARCH, pkg.id), pkg.pkgname);
    }

    for (const pkg of chaoticPkgs) {
      map.set(encodeOwnerKey(TriggerType.CHAOTIC, pkg.id), pkg.pkgname);
    }

    return map;
  }

  private async updateDirectoryIndex(packages: Pick<PackageElfAnalysis, 'pkgType' | 'pkgId'>[]): Promise<void> {
    if (packages.length === 0) return;

    const cache = await this.loadDirectoryCache();

    /**
     * Drop each affected key's previous contribution so a re-scan of the same
     * package cannot leave stale directories behind.
     */
    for (const pkg of packages) {
      const triggerType = triggerTypeOf(pkg.pkgType);
      const key = encodeOwnerKey(triggerType, pkg.pkgId);
      const record = cache.dirs.get(key);
      if (record) {
        for (const dir of record.direct) {
          removeOwner(cache.index.direct, dir, key);
        }

        for (const dir of record.ancestors) {
          removeOwner(cache.index.ancestors, dir, key);
        }

        cache.dirs.delete(key);
      }

      cache.index.keyToFiles.delete(key);
    }

    const archIds = packages.filter((p) => p.pkgType === ARCH_PKG_TYPE).map((p) => p.pkgId);
    const chaoticIds = packages.filter((p) => p.pkgType === CHAOTIC_PKG_TYPE).map((p) => p.pkgId);
    const select = { pkgId: true, directDirectories: true, directoriesOwned: true };
    const [archRows, chaoticRows] = await Promise.all([
      this.findAnalyses(ARCH_PKG_TYPE, archIds, select),
      this.findAnalyses(CHAOTIC_PKG_TYPE, chaoticIds, select),
    ]);

    for (const row of archRows) {
      applyOwnerDirs(cache, encodeOwnerKey(TriggerType.ARCH, row.pkgId), row);
    }

    for (const row of chaoticRows) {
      applyOwnerDirs(cache, encodeOwnerKey(TriggerType.CHAOTIC, row.pkgId), row);
    }

    const missingArch = archIds.filter((id) => !cache.index.keyToPkgname.has(encodeOwnerKey(TriggerType.ARCH, id)));
    const missingChaotic = chaoticIds.filter(
      (id) => !cache.index.keyToPkgname.has(encodeOwnerKey(TriggerType.CHAOTIC, id)),
    );
    const pkgnames = await this.buildKeyToPkgname(missingArch, missingChaotic);
    for (const [key, name] of pkgnames) {
      cache.index.keyToPkgname.set(key, name);
    }
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
    for (const pkg of [...archPkgs, ...chaoticPkgs]) {
      map.set(pkg.id, pkg.pkgname);
    }

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
    /**
     * Rebuild the directory index from the DB: it incrementally accumulates
     * owner contributions, and rows the importer replaced or removed would
     * otherwise linger as stale owners on shared directories forever.
     */
    this.directoryCache = null;
    await this.updateDirectoryIndex(analyses);

    /**
     * pluginOf depends on the directory index of OTHER packages: an import that
     * extends one owner (kwin gaining plugin directories) must re-derive every
     * stored consumer of the touched namespaces, not only the changed rows.
     */
    const touched = [...new Set(analyses.map((a) => a.pkgType))];

    for (const pkgType of touched) {
      await this.recomputePluginOfPkgType(pkgType);
    }

    await this.recomputeBroken(
      analyses
        .filter((a) => a.pkgType === CHAOTIC_PKG_TYPE)
        .map((a) => ({ pkgType: TriggerType.CHAOTIC, pkgId: a.pkgId })),
      { freshlyScanned: true },
    );
  }

  async recomputePluginOfPkgType(pkgType: PackageElfPkgType): Promise<void> {
    const analyses = await this.analysisRepository.find({
      where: { pkgType },
      select: { pkgType: true, pkgId: true, version: true },
    });

    await this.recomputePluginOf(analyses);
  }

  /**
   * Batched, because the files of a whole namespace do not fit in memory.
   */
  private async recomputePluginOf(
    analyses: Pick<PackageElfAnalysis, 'pkgType' | 'pkgId' | 'version'>[],
  ): Promise<void> {
    if (analyses.length === 0) return;

    const pkgnameById = await this.loadPkgnameMap(
      analyses.map((a) => ({ pkgType: triggerTypeOf(a.pkgType), pkgId: a.pkgId })),
    );

    let derived = 0;
    for (let offset = 0; offset < analyses.length; offset += PLUGIN_OF_BATCH_SIZE) {
      const batch = analyses.slice(offset, offset + PLUGIN_OF_BATCH_SIZE);
      const toSave = await this.derivePluginOfBatch(batch, pkgnameById);
      await saveInBatches(this.analysisRepository, toSave, ANALYSIS_SAVE_BATCH);

      derived += toSave.length;
      this.pino.debug({ current: derived, total: analyses.length }, 'Derived pluginOf');
    }
  }

  private async derivePluginOfBatch(
    batch: Pick<PackageElfAnalysis, 'pkgType' | 'pkgId' | 'version'>[],
    pkgnameById: Map<number, string>,
  ): Promise<PluginOfUpdate[]> {
    const rows = await this.analysisRepository.find({
      where: batch.map(({ pkgType, pkgId, version }) => ({ pkgType, pkgId, version })),
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

    const toSave: PluginOfUpdate[] = [];
    for (const [index, analysis] of rows.entries()) {
      if (index % YIELD_EVERY === 0) {
        await yieldToEventLoop();
      }

      const pluginOf = await this.pluginOfFor(analysis.files, {
        consumerPkgname: pkgnameById.get(analysis.pkgId) ?? null,
        hasCompiledCode: analysis.providedSonames.length > 0 || analysis.neededSonames.length > 0,
        isSourceCompiled: analysis.isSourceCompiled,
      });

      const { id, pkgType, pkgId, version } = analysis;
      toSave.push({ id, pkgType, pkgId, version, pluginOf });
    }

    return toSave;
  }
}
