import { type RebuildCoverageReport } from '@chaotic-next/shared-lib';
import { In, IsNull, MoreThanOrEqual, Not, Raw, type Repository } from 'typeorm';
import { type Package } from '../../builder/builder.entity';
import {
  BumpType,
  type ConsumerAbiBreak,
  type OwnerDescriptor,
  type PluginBreakEntry,
  type PluginBreakIndexEntry,
  TriggerType,
} from '../../interfaces/repo-manager';
import { yieldToEventLoop } from '../../utils/functions';
import { type ComputeLogger } from '../compute/compute-logger';
import {
  type ArchlinuxPackage,
  isRemoved,
  PackageBump,
  type PackageElfAnalysis,
  type PackageElfPkgType,
} from '../repo-manager.entity';
import {
  type BrokenDependency,
  compareArchVersions,
  encodeOwnerKey,
  findBrokenDependencies,
  findVersionNodeBreaks,
  findVtableDrifts,
  formatBrokenDependency,
  formatConsumerAbiBreak,
  latestAnalysisByKey,
  pkgTypeOf,
  type RuntimeName,
  sameLibraryFamily,
} from '../signal';
import { pickBaselineVersion } from './baseline-version';
import { DependencyClosure, type DependencyRecord } from './dependency-closure';
import { latestActiveAnalysesByPackage } from './latest-analyses';
import { groupByPkgbase, pkgbaseOf, recordedDeps } from './pkgbase-outputs';
import { loadRuntimeVersions } from './runtime-versions';

// Package splits: boost headers vs boost-libs sonames.
const PACKAGE_ALIASES: Record<string, string[]> = {
  'boost': ['boost-libs'],
  'boost-libs': ['boost'],
};

function depsContains(deps: Set<string>, pkgname: string): boolean {
  if (deps.has(pkgname)) return true;

  for (const alias of PACKAGE_ALIASES[pkgname] ?? []) {
    if (deps.has(alias)) return true;
  }

  return false;
}

/**
 * Compiler-runtime symbols that fill vtable slots (pure-virtual / deleted-virtual
 * placeholders) but are imported by every C++ binary, so they never identify a
 * specific library's ABI. Matching a shifted slot that is one of these would flag
 * every C++ package whenever any library's vtable drifts.
 */
const UNIVERSAL_VTABLE_SLOTS = new Set([
  '__cxa_pure_virtual',
  '__cxa_deleted_virtual',
  '__cxa_throw',
  '__cxa_rethrow',
  '__cxa_begin_catch',
  '__cxa_end_catch',
  '__gxx_personality_v0',
  '__cxa_guard_acquire',
  '__cxa_guard_release',
  '__cxa_guard_abort',
  '__cxa_allocate_exception',
  '__cxa_free_exception',
  '__cxa_get_exception_ptr',
  '_Unwind_Resume',
  '_Unwind_RaiseException',
  '_Unwind_DeleteException',
  '_Unwind_GetLanguageSpecificData',
  '_Unwind_ForcedUnwind',
  '_Unwind_Resume_or_Rethrow',
]);

// How many detail entries a rebuild's log line / commit message keeps before "…".
const ABI_BREAK_DETAILS_LIMIT = 1;

// How many pkgIds one `IN (...)` analysis query may contain, to bound result-set size.
const ANALYSIS_QUERY_BATCH_SIZE = 500;

// Each ABI check is pure CPU work.
const YIELD_EVERY = 10;

export function summarizeDetails(details: string[]): string[] {
  if (details.length <= ABI_BREAK_DETAILS_LIMIT) return details;

  const kept = details.slice(0, ABI_BREAK_DETAILS_LIMIT);
  kept.push(`... ${details.length - ABI_BREAK_DETAILS_LIMIT} more`);
  return kept;
}

// An Arch update or a Chaotic deployment.
type ChangedOwner = ArchlinuxPackage | Package;

function isArchOwner(owner: ChangedOwner): owner is ArchlinuxPackage {
  return 'previousVersion' in owner;
}

/**
 * Shared state for broken-deps detection. Built once per change set and
 * reused across every consumer, so the provided-soname index, runtime
 * versions and the provided sonames before and after the change load once.
 */
interface BrokenDepsContext {
  changed: ChangedOwner[];
  // soname -> set of provider pkgnames (real providers, latest analysis per package).
  providedByPkgname: Map<string, Set<string>>;
  // pacman installs these transitively, so they always count as provided.
  archProvidedSonames: Set<string>;
  runtimes: Partial<Record<RuntimeName, string | null>>;
  previousProvidedByPkg: Map<number, Set<string>>;
  currentProvidedByPkg: Map<number, Set<string>>;
  // Current version nodes each changed pkg provides, per soname.
  currentVersionNodesByPkg: Map<number, Record<string, string[]>>;
  // Sonames that a changed pkg provided before the change and does not provide now.
  droppedSonames: Set<string>;
  // Null only in tests.
  dependencyClosure: DependencyClosure | null;
}

type ProvidedAnalysis = Pick<PackageElfAnalysis, 'pkgId' | 'version' | 'providedSonames' | 'providedVersionNodes'>;

interface DetectedTrigger {
  bumpType: BumpType;
  archPkg: ChangedOwner;
  triggerFrom: TriggerType;
  reason: string;
  details: string[];
}

// `ownerId` is an ArchlinuxPackage id for an Arch trigger and a Package id for a Chaotic trigger.
export interface DetectedTriggerDto {
  bumpType: BumpType;
  triggerFrom: TriggerType;
  ownerId: number;
  reason: string;
  details: string[];
}

function toDto(trigger: DetectedTrigger): DetectedTriggerDto {
  return {
    bumpType: trigger.bumpType,
    triggerFrom: trigger.triggerFrom,
    ownerId: trigger.archPkg.id,
    reason: trigger.reason,
    details: trigger.details,
  };
}

// Package id -> start of a break that happened after the build.
type MissedBreaks = Map<number, Date>;

// Runs in the compute worker. Explicit `CI_REBUILD_TRIGGERS` are excluded: the pkgbuilds CI already rebuilds on those.
export class TriggerDetector {
  constructor(
    private readonly elfAnalysisRepository: Repository<PackageElfAnalysis>,
    private readonly archlinuxPackageRepository: Repository<ArchlinuxPackage>,
    private readonly packagesRepository: Repository<Package>,
    private readonly pino: ComputeLogger,
  ) {}

  /**
   * Keyed by PKGBUILD directory. Every output of a PKGBUILD counts, so a broken split output (lib32-*, *-libs) is found too.
   */
  async detectArchTriggers(repoId: number, changedIds: number[]): Promise<Map<string, DetectedTriggerDto>> {
    const changed = changedIds.length
      ? await this.archlinuxPackageRepository.find({ where: { id: In(changedIds) } })
      : [];
    const changedOwners = changed.filter((pkg) => !isRemoved(pkg)).map(toOwnerDescriptor);
    const pluginBreakIndex = await this.buildPluginBreakIndex(changedOwners);
    const brokenDepsCtx = await this.buildBrokenDepsContext(changed);
    const outputsByPkgbase = groupByPkgbase(await this.loadRepoOutputs(repoId));
    const consumerAnalyses = await this.loadLatestChaoticAnalyses(
      [...outputsByPkgbase.values()].flat().map((pkg) => pkg.id),
    );
    const missedBreaks = missedBreaksIn(consumerAnalyses);

    const detected = new Map<string, DetectedTriggerDto>();

    let checked = 0;
    for (const [pkgbaseDir, outputs] of outputsByPkgbase) {
      checked++;

      if (checked % YIELD_EVERY === 0) {
        await yieldToEventLoop();
      }

      let trigger = this.archTriggerFor(outputs, consumerAnalyses, brokenDepsCtx, pluginBreakIndex, changed);
      if (!trigger) {
        trigger = await this.missedBreakTriggerFor(pkgbaseDir, repoId, outputs, consumerAnalyses, missedBreaks);
      }

      if (trigger) {
        detected.set(pkgbaseDir, toDto(trigger));
      }
    }

    this.pino.info({ count: detected.size, repoId }, 'Found packages to rebuild');
    return detected;
  }

  /**
   * One rebuild covers both kinds of break, so the first one found is enough.
   */
  private archTriggerFor(
    outputs: Package[],
    consumerAnalyses: Map<number, PackageElfAnalysis>,
    brokenDepsCtx: BrokenDepsContext | null,
    pluginBreakIndex: Map<string, PluginBreakIndexEntry>,
    changed: ArchlinuxPackage[],
  ): DetectedTrigger | null {
    const analyzed: { output: Package; analysis: PackageElfAnalysis }[] = [];
    for (const output of outputs) {
      const analysis = consumerAnalyses.get(output.id);
      if (analysis) {
        analyzed.push({ output, analysis });
      }
    }

    if (brokenDepsCtx) {
      for (const { output, analysis } of analyzed) {
        const broken = this.brokenDepsForConsumer(analysis, brokenDepsCtx, recordedDeps(output));
        if (broken) return brokenDepsTrigger(broken, TriggerType.ARCH);
      }
    }

    for (const { analysis } of analyzed) {
      const breaks = this.consumerSymbolBreaksFor(analysis, pluginBreakIndex);
      if (breaks.length === 0) continue;

      const archPkg = changed.find((pkg) => pkg.id === breaks[0].pkgId);
      if (archPkg) return pluginBreakTrigger(breaks, archPkg, TriggerType.ARCH);
    }

    return null;
  }

  /**
   * Works for Arch and Chaotic owners alike.
   */
  async buildPluginBreakIndex(changed: OwnerDescriptor[]): Promise<Map<string, PluginBreakIndexEntry>> {
    const index: Map<string, PluginBreakIndexEntry> = new Map();
    const withPrevious = changed.filter((owner) => owner.previousVersion);
    if (withPrevious.length === 0) return index;

    this.pino.debug({ owners: withPrevious.length }, 'Building plugin-break index');

    const pairs = await this.loadOwnerAnalysisPairs(withPrevious);
    for (const owner of withPrevious) {
      const pair = pairs.get(ownerPairKey(owner));
      if (!pair?.previous || !pair.current) {
        this.pino.debug(
          {
            pkgname: owner.pkgname,
            previousVersion: owner.previousVersion,
            currentVersion: owner.currentVersion,
          },
          'Missing ELF analysis pair, skipping symbol scan',
        );
        continue;
      }

      const entry = ownerBreakEntry(owner, pair.previous, pair.current);
      if (entry) {
        index.set(encodeOwnerKey(owner.pkgType, owner.pkgId), entry);
      }
    }

    return index;
  }

  private async loadOwnerAnalysisPairs(
    owners: OwnerDescriptor[],
  ): Promise<Map<string, { previous?: PackageElfAnalysis; current?: PackageElfAnalysis }>> {
    const versionRows = await this.elfAnalysisRepository.find({
      where: owners.map((owner) => ({ pkgType: pkgTypeOf(owner.pkgType), pkgId: owner.pkgId })),
      select: { pkgType: true, pkgId: true, version: true },
    });

    const versionsByOwner = new Map<string, string[]>();
    for (const row of versionRows) {
      const key = `${row.pkgType}|${row.pkgId}`;
      const versions = versionsByOwner.get(key);
      if (versions) {
        versions.push(row.version);
      } else {
        versionsByOwner.set(key, [row.version]);
      }
    }

    const wanted: { owner: OwnerDescriptor; previous: string | null }[] = owners.map((owner) => ({
      owner,
      previous: pickBaselineVersion(
        versionsByOwner.get(ownerPairKey(owner)) ?? [],
        owner.previousVersion ?? '',
        owner.currentVersion,
      ),
    }));

    const versionsToLoad: { pkgType: PackageElfPkgType; pkgId: number; version: string }[] = [];
    for (const { owner, previous } of wanted) {
      const pkgType = pkgTypeOf(owner.pkgType);
      versionsToLoad.push({ pkgType, pkgId: owner.pkgId, version: owner.currentVersion });

      if (previous) {
        versionsToLoad.push({ pkgType, pkgId: owner.pkgId, version: previous });
      }
    }

    const analyses = await this.elfAnalysisRepository.find({ where: versionsToLoad });

    const byVersion = new Map(analyses.map((a) => [`${a.pkgType}|${a.pkgId}|${a.version}`, a]));

    const pairs = new Map<string, { previous?: PackageElfAnalysis; current?: PackageElfAnalysis }>();
    for (const { owner, previous } of wanted) {
      const key = ownerPairKey(owner);
      pairs.set(key, {
        previous: previous ? byVersion.get(`${key}|${previous}`) : undefined,
        current: byVersion.get(`${key}|${owner.currentVersion}`),
      });
    }

    return pairs;
  }

  /**
   * Keyed by consumer package id.
   */
  async deploymentTriggers(deployedIds: number[], consumerIds: number[]): Promise<Map<number, DetectedTriggerDto>> {
    const detected = new Map<number, DetectedTriggerDto>();
    const [deployedOutputs, consumers] = await Promise.all([
      this.loadPackagesById(deployedIds),
      this.loadPackagesById(consumerIds),
    ]);
    const scanned = consumers.filter((pkg) => !pkg.skipSignalScan);
    const consumerAnalyses = await this.loadLatestChaoticAnalyses(scanned.map((pkg) => pkg.id));
    const ownerIndex = await this.buildDeployedOwnerBreakIndex(deployedOutputs);
    const brokenDepsCtx = await this.buildChaoticBrokenDepsContext(deployedOutputs);
    for (const [index, consumer] of scanned.entries()) {
      if (index % YIELD_EVERY === 0) {
        await yieldToEventLoop();
      }

      const analysis = consumerAnalyses.get(consumer.id);
      if (!analysis) continue;

      const breaks = this.consumerSymbolBreaksFor(analysis, ownerIndex);
      const breakOwner = deployedOutputs.find((pkg) => pkg.id === breaks[0]?.pkgId);
      if (breakOwner) {
        detected.set(consumer.id, toDto(pluginBreakTrigger(breaks, breakOwner, TriggerType.CHAOTIC)));
        continue;
      }

      const broken = brokenDepsCtx ? this.brokenDepsForConsumer(analysis, brokenDepsCtx, recordedDeps(consumer)) : null;
      if (broken) {
        detected.set(consumer.id, toDto(brokenDepsTrigger(broken, TriggerType.CHAOTIC)));
      }
    }

    return detected;
  }

  private async loadPackagesById(ids: number[]): Promise<Package[]> {
    const packages: Package[] = [];
    for (let offset = 0; offset < ids.length; offset += ANALYSIS_QUERY_BATCH_SIZE) {
      packages.push(
        ...(await this.packagesRepository.find({
          where: { id: In(ids.slice(offset, offset + ANALYSIS_QUERY_BATCH_SIZE)) },
          select: { id: true, pkgname: true, pkgbaseName: true, metadata: true, skipSignalScan: true },
        })),
      );
    }

    return packages;
  }

  private async buildDeployedOwnerBreakIndex(outputs: Package[]): Promise<Map<string, PluginBreakIndexEntry>> {
    const owners: OwnerDescriptor[] = [];
    for (const pkg of outputs) {
      const versions = await this.newestTwoChaoticVersions(pkg.id);
      if (!versions) continue;

      owners.push({
        pkgType: TriggerType.CHAOTIC,
        pkgId: pkg.id,
        pkgname: pkg.pkgname,
        previousVersion: versions.previous,
        currentVersion: versions.current,
      });
    }

    return this.buildPluginBreakIndex(owners);
  }

  private async newestTwoChaoticVersions(pkgId: number): Promise<{ current: string; previous: string } | null> {
    const rows = await this.elfAnalysisRepository.find({
      where: { pkgType: pkgTypeOf(TriggerType.CHAOTIC), pkgId },
      select: { version: true },
    });

    // Arch version order, not DB string order (which misorders e.g. 2:13 vs 2:9 or 1.10 vs 1.9).
    const sorted = rows.map((row) => row.version).sort((a, b) => compareArchVersions(b, a));
    const [current, previous] = sorted;
    if (current === undefined || previous === undefined) return null;

    return { current, previous };
  }

  /**
   * Runtime directories never break through a Chaotic package, so the runtime check stays off.
   */
  private async buildChaoticBrokenDepsContext(outputs: Package[]): Promise<BrokenDepsContext | null> {
    const previousRows: ProvidedAnalysis[] = [];
    const currentRows: ProvidedAnalysis[] = [];
    const changed: Package[] = [];
    for (const pkg of outputs) {
      const versions = await this.newestTwoChaoticVersions(pkg.id);
      if (!versions) continue;

      const rows = await this.elfAnalysisRepository.find({
        where: { pkgType: pkgTypeOf(TriggerType.CHAOTIC), pkgId: pkg.id, version: In(Object.values(versions)) },
        select: { pkgId: true, version: true, providedSonames: true, providedVersionNodes: true },
      });

      const previous = rows.find((row) => row.version === versions.previous);
      const current = rows.find((row) => row.version === versions.current);
      if (!previous || !current) continue;

      previousRows.push(previous);
      currentRows.push(current);
      changed.push(pkg);
    }

    if (changed.length === 0) return null;

    return this.assembleBrokenDepsContext(changed, previousRows, currentRows, {});
  }

  /**
   * Latest-version Chaotic analyses for the given package ids, keyed by pkgId.
   * Loads only the columns the trigger checks read — full rows would hydrate
   * megabytes of exportedSymbols/vtables/files per package and exhaust the heap.
   */
  async loadLatestChaoticAnalyses(pkgIds: number[]): Promise<Map<number, PackageElfAnalysis>> {
    const map = new Map<number, PackageElfAnalysis>();
    if (pkgIds.length === 0) return map;

    const rows: PackageElfAnalysis[] = [];
    for (let offset = 0; offset < pkgIds.length; offset += ANALYSIS_QUERY_BATCH_SIZE) {
      const batch = pkgIds.slice(offset, offset + ANALYSIS_QUERY_BATCH_SIZE);
      rows.push(
        ...(await this.elfAnalysisRepository.find({
          where: { pkgType: pkgTypeOf(TriggerType.CHAOTIC), pkgId: In(batch) },
          select: {
            pkgId: true,
            version: true,
            files: true,
            neededSonames: true,
            providedSonames: true,
            importedSymbols: true,
            neededVersionNodes: true,
            pluginOf: true,
            broken: true,
            brokenReasons: true,
            brokenSince: true,
            scannedAt: true,
          },
        })),
      );
    }

    this.pino.debug({ analyses: rows.length, packages: pkgIds.length }, 'Loaded latest Chaotic analyses');

    /**
     * Keep the newest version per package by Arch version order, not DB string
     * order (which misorders e.g. 2:13 vs 2:9 or 1.10 vs 1.9).
     */
    const latest = latestAnalysisByKey(rows, (row) => String(row.pkgId));

    for (const [key, row] of latest) {
      map.set(Number(key), row);
    }

    return map;
  }

  /**
   * Pure ABI-break intersection for one consumer against the break index. No
   * DB access — callers batch-load analyses and reuse the index. Lost symbols
   * count for every consumer that links the affected soname, because the
   * dynamic linker fails on any undefined symbol. A vtable drift only counts
   * for plugins of the owner, because only those subclass its types.
   */
  consumerSymbolBreaksFor(
    consumer: PackageElfAnalysis,
    pluginBreakIndex: Map<string, PluginBreakIndexEntry>,
  ): ConsumerAbiBreak[] {
    const consumerImports: Set<string> = new Set(consumer.importedSymbols ?? []);
    const neededSonames: Set<string> = new Set(consumer.neededSonames ?? []);
    const pluginOf: Set<string> = new Set(consumer.pluginOf ?? []);
    const breaks: ConsumerAbiBreak[] = [];
    for (const [ownerKey, indexEntry] of pluginBreakIndex) {
      const isPlugin = pluginOf.has(ownerKey);
      for (const entry of indexEntry.symbolBreaks) {
        if (!isPlugin && !neededSonames.has(entry.soname)) continue;

        /**
         * A consumer that ships its own copy of the library (e.g. python39
         * bundling libpython3.9.so.1.0) resolves those symbols locally, not
         * against the owner's updated soname, so it is not a break victim.
         */
        if (this.selfProvidesLibrary(consumer, entry.soname)) continue;

        for (const symbol of entry.lostSymbols) {
          if (consumerImports.has(symbol)) {
            breaks.push({ symbol, soname: entry.soname, pkgname: entry.pkgname, pkgId: entry.pkgId });
          }
        }
      }

      if (!isPlugin) continue;

      for (const { vtable, shiftedSlots } of indexEntry.vtableDrifts) {
        for (const slot of shiftedSlots) {
          if (UNIVERSAL_VTABLE_SLOTS.has(slot)) continue;

          if (consumerImports.has(slot)) {
            breaks.push({ slot, vtable, pkgname: indexEntry.pkgname, pkgId: indexEntry.pkgId });
          }
        }
      }
    }

    return breaks;
  }

  private selfProvidesLibrary(consumer: PackageElfAnalysis, soname: string): boolean {
    return (consumer.providedSonames ?? []).some((provided) => sameLibraryFamily(provided, soname));
  }

  private loadRepoOutputs(repoId: number): Promise<Package[]> {
    return this.packagesRepository.find({
      where: { isActive: true, repo: { id: repoId } },
      select: { id: true, pkgname: true, pkgbaseName: true, metadata: true, skipSignalScan: true },
    });
  }

  private async buildBrokenDepsContext(changed: ArchlinuxPackage[]): Promise<BrokenDepsContext | null> {
    const relevantChanged = changed.filter((pkg) => pkg.previousVersion);
    if (!relevantChanged.length) return null;

    const currentVersions: { pkgId: number; version: string }[] = [];
    for (const pkg of relevantChanged) {
      if (pkg.version && !isRemoved(pkg)) {
        currentVersions.push({ pkgId: pkg.id, version: pkg.version });
      }
    }

    const [previousRows, currentRows] = await Promise.all([
      this.loadBaselineAnalyses(relevantChanged),
      this.loadProvidedSonameAnalyses(currentVersions),
    ]);

    this.pino.debug(
      { changed: relevantChanged.length, previousAnalyses: previousRows.length },
      'Broken-deps context loaded',
    );
    const runtimes = await loadRuntimeVersions(this.archlinuxPackageRepository);
    return this.assembleBrokenDepsContext(relevantChanged, previousRows, currentRows, runtimes);
  }

  /**
   * A removed package has no current analysis, so it provides nothing now.
   */
  private async assembleBrokenDepsContext(
    changed: ChangedOwner[],
    previousRows: ProvidedAnalysis[],
    currentRows: ProvidedAnalysis[],
    runtimes: Partial<Record<RuntimeName, string | null>>,
  ): Promise<BrokenDepsContext> {
    const [{ providedByPkgname, archProvidedSonames }, dependencyClosure] = await Promise.all([
      this.loadSonameProviders(),
      this.loadDependencyClosure(),
    ]);
    const previousProvidedByPkg = new Map<number, Set<string>>();
    for (const row of previousRows) {
      previousProvidedByPkg.set(row.pkgId, new Set(row.providedSonames));
    }

    const currentProvidedByPkg = new Map<number, Set<string>>();
    for (const row of currentRows) {
      currentProvidedByPkg.set(row.pkgId, new Set(row.providedSonames));
    }

    const currentVersionNodesByPkg = new Map<number, Record<string, string[]>>();
    for (const row of currentRows) {
      currentVersionNodesByPkg.set(row.pkgId, row.providedVersionNodes ?? {});
    }

    return {
      changed,
      providedByPkgname,
      archProvidedSonames,
      runtimes,
      previousProvidedByPkg,
      currentProvidedByPkg,
      currentVersionNodesByPkg,
      droppedSonames: findDroppedSonames(previousProvidedByPkg, currentProvidedByPkg),
      dependencyClosure,
    };
  }

  private async loadBaselineAnalyses(changed: ArchlinuxPackage[]): Promise<ProvidedAnalysis[]> {
    const rows = await this.elfAnalysisRepository.find({
      where: { pkgType: pkgTypeOf(TriggerType.ARCH), pkgId: In(changed.map((pkg) => pkg.id)) },
      select: { pkgId: true, version: true, providedSonames: true, providedVersionNodes: true },
    });

    const baselines: ProvidedAnalysis[] = [];
    for (const pkg of changed) {
      const ownRows = rows.filter((row) => row.pkgId === pkg.id);
      const currentVersion = isRemoved(pkg) ? null : pkg.version;
      const olderVersions = ownRows.map((row) => row.version).filter((version) => version !== currentVersion);
      const baselineVersion = pickBaselineVersion(olderVersions, pkg.previousVersion ?? '', currentVersion);
      const baseline = ownRows.find((row) => row.version === baselineVersion);
      if (baseline) {
        baselines.push(baseline);
      }
    }

    return baselines;
  }

  private async loadDependencyClosure(): Promise<DependencyClosure> {
    const [archPkgs, chaoticPkgs] = await Promise.all([
      this.archlinuxPackageRepository.find({
        where: { deactivatedAt: IsNull() },
        select: { pkgname: true, metadata: true },
      }),
      this.packagesRepository.find({ where: { isActive: true }, select: { pkgname: true, metadata: true } }),
    ]);
    const records: DependencyRecord[] = [...archPkgs, ...chaoticPkgs].map((pkg) => ({
      pkgname: pkg.pkgname,
      deps: pkg.metadata?.deps ?? [],
      provides: pkg.metadata?.provides ?? [],
    }));

    return new DependencyClosure(records);
  }

  /**
   * A soname that a changed package dropped counts as provided only when one
   * of its remaining providers is in the consumer's dependency closure. A
   * compat package that still ships the old soname (llvm22-libs after the llvm
   * 23 update) is not installed with the consumer, so it cannot satisfy it.
   * Consumers without recorded deps keep the lenient any-provider rule.
   */
  private withholdUnreachableDroppedSonames(
    provided: Set<string>,
    consumer: PackageElfAnalysis,
    reachable: Set<string> | null,
    ctx: BrokenDepsContext,
  ): void {
    if (reachable === null) return;

    for (const soname of consumer.neededSonames.filter((needed) => ctx.droppedSonames.has(needed))) {
      const providers = ctx.providedByPkgname.get(soname) ?? new Set<string>();
      if (![...providers].some((provider) => reachable.has(provider))) {
        provided.delete(soname);
      }
    }
  }

  /**
   * Soname providers from the latest analysis of every active package:
   * `providedByPkgname` maps each soname to its provider names (Arch and
   * Chaotic alike), `archProvidedSonames` collects the sonames any current
   * Arch package provides.
   */
  private async loadSonameProviders(): Promise<{
    providedByPkgname: Map<string, Set<string>>;
    archProvidedSonames: Set<string>;
  }> {
    const latest = await latestActiveAnalysesByPackage(
      this.elfAnalysisRepository,
      this.archlinuxPackageRepository,
      this.packagesRepository,
    );
    const archType = pkgTypeOf(TriggerType.ARCH);
    const bySoname = new Map<string, Set<string>>();
    const archProvidedSonames = new Set<string>();
    for (const { pkgname, analysis } of latest.values()) {
      const isArch = analysis.pkgType === archType;
      for (const soname of analysis.providedSonames) {
        if (isArch) {
          archProvidedSonames.add(soname);
        }

        const set = bySoname.get(soname) ?? new Set<string>();
        set.add(pkgname);
        bySoname.set(soname, set);
      }
    }

    return { providedByPkgname: bySoname, archProvidedSonames };
  }

  /**
   * The provided-soname index restricted to the packages a consumer depends on:
   * a needed soname is satisfied only when one of its declared deps provides it.
   * Sonames provided by any current Arch package always count as satisfied —
   * pacman resolves them transitively (spotify needs libharfbuzz.so.0 while only
   * depending on gtk3), so flagging them produces mass false-positive rebuilds.
   * If the deps are unknown (null), all providers count, so the check is a
   * no-op rather than flagging everything.
   */
  providedForDeps(
    providedByPkgname: Map<string, Set<string>>,
    consumerDeps: string[] | null,
    archProvidedSonames: Set<string>,
  ): Set<string> {
    const satisfied = new Set<string>(archProvidedSonames);
    if (consumerDeps === null) {
      for (const soname of providedByPkgname.keys()) {
        satisfied.add(soname);
      }

      return satisfied;
    }

    const deps = new Set(consumerDeps);
    for (const [soname, providers] of providedByPkgname) {
      for (const provider of providers) {
        if (depsContains(deps, provider)) {
          satisfied.add(soname);
          break;
        }
      }
    }

    return satisfied;
  }

  private async loadProvidedSonameAnalyses(entries: { pkgId: number; version: string }[]): Promise<ProvidedAnalysis[]> {
    if (entries.length === 0) return [];

    return this.elfAnalysisRepository.find({
      where: entries.map((entry) => ({
        pkgType: pkgTypeOf(TriggerType.ARCH),
        pkgId: entry.pkgId,
        version: entry.version,
      })),
      select: { pkgId: true, version: true, providedSonames: true, providedVersionNodes: true },
    });
  }

  private brokenDepsForConsumer(
    consumer: PackageElfAnalysis,
    ctx: BrokenDepsContext,
    consumerDeps: string[] | null,
  ): { deps: BrokenDependency[]; archPkg: ChangedOwner } | null {
    const reachable = reachableFrom(ctx.dependencyClosure, consumerDeps);
    const providedSonames = this.providedForDeps(ctx.providedByPkgname, consumerDeps, ctx.archProvidedSonames);
    this.withholdUnreachableDroppedSonames(providedSonames, consumer, reachable, ctx);
    const deps = findBrokenDependencies({
      neededSonames: consumer.neededSonames,
      files: consumer.files,
      providedSonames,
      runtimes: ctx.runtimes,
      selfProvidedSonames: consumer.providedSonames,
    });

    const relevant: BrokenDependency[] = [];
    let cause: ChangedOwner | undefined;
    for (const dep of deps) {
      const culprit = brokenDependencyCulprit(dep, ctx);
      if (culprit) {
        relevant.push(dep);
        cause = cause ?? culprit;
      }
    }

    for (const [soname, requiredNodes] of Object.entries(consumer.neededVersionNodes ?? {})) {
      if (requiredNodes.length === 0) continue;

      if (this.selfProvidesLibrary(consumer, soname)) continue;

      const versionBreak = findVersionNodeCulprit(soname, requiredNodes, ctx, reachable);
      if (versionBreak) {
        relevant.push({ kind: 'version', soname, versionNodes: versionBreak.versionNodes });
        cause = cause ?? versionBreak.culprit;
      }
    }

    if (relevant.length === 0 || !cause) return null;

    return { deps: relevant, archPkg: cause };
  }

  /**
   * Catches a break that the other channels missed, for example after a failed run. A package that is broken as built is not rebuilt.
   */
  private async missedBreakTriggerFor(
    pkgbaseDir: string,
    repoId: number,
    outputs: Package[],
    consumerAnalyses: Map<number, PackageElfAnalysis>,
    missedBreaks: MissedBreaks,
  ): Promise<DetectedTrigger | null> {
    for (const output of outputs) {
      const brokenSince = missedBreaks.get(output.id);
      const analysis = consumerAnalyses.get(output.id);
      if (!brokenSince || !analysis) continue;

      // Bumps are recorded on the package named after the PKGBUILD directory.
      const pkgbasePkg = await this.packagesRepository.findOne({
        where: { pkgname: pkgbaseDir, repo: { id: repoId } },
        select: { id: true },
      });

      const bumpedPkgId = pkgbasePkg ? pkgbasePkg.id : output.id;
      const alreadyBumped = await this.bumpedSince(bumpedPkgId, brokenSince);
      if (alreadyBumped) continue;

      const deps = await this.currentBrokenDependencies(analysis);
      const culprit = await this.blameMissedBreak(deps, outputs);
      if (!culprit) {
        this.pino.warn({ pkgname: output.pkgname }, 'Broken package has no package to blame, skipping rebuild');
        continue;
      }

      return {
        bumpType: BumpType.BROKEN_DEPS,
        archPkg: culprit.owner,
        triggerFrom: culprit.triggerFrom,
        reason: 'broken dependency without a rebuild',
        details: deps.map(formatBrokenDependency),
      };
    }

    return null;
  }

  async countUncoveredMissedBreaks(): Promise<number> {
    const active = await this.loadActiveChaoticPackages();
    const latest = await this.loadLatestChaoticAnalyses(active.map((pkg) => pkg.id));
    const uncovered = await this.findUncoveredMissedBreaks(active, latest);

    return uncovered.length;
  }

  async rebuildCoverage(): Promise<RebuildCoverageReport> {
    const active = await this.loadActiveChaoticPackages();
    const latest = await this.loadLatestChaoticAnalyses(active.map((pkg) => pkg.id));
    const uncovered = await this.findUncoveredMissedBreaks(active, latest);
    return {
      uncoveredBreaks: uncovered.map(({ pkg, analysis, brokenSince }) => ({
        pkgname: pkg.pkgname,
        repoName: pkg.repo.name,
        version: analysis.version,
        brokenSince: brokenSince.toISOString(),
        reasons: analysis.brokenReasons,
      })),
      unanalyzed: active
        .filter((pkg) => !pkg.skipSignalScan && pkg.version && latest.get(pkg.id)?.version !== pkg.version)
        .map((pkg) => ({ pkgname: pkg.pkgname, repoName: pkg.repo.name, version: pkg.version ?? undefined })),
      removedProviderSonames: await this.findRemovedProviderSonames(active, latest),
    };
  }

  private loadActiveChaoticPackages(): Promise<Package[]> {
    return this.packagesRepository.find({
      where: { isActive: true },
      relations: { repo: true },
      select: {
        id: true,
        pkgname: true,
        pkgbaseName: true,
        version: true,
        skipSignalScan: true,
        repo: { id: true, name: true },
      },
    });
  }

  private async findUncoveredMissedBreaks(
    active: Package[],
    analyses: Map<number, PackageElfAnalysis>,
  ): Promise<{ pkg: Package; analysis: PackageElfAnalysis; brokenSince: Date }[]> {
    const missedBreaks = missedBreaksIn(analyses);
    const pkgbaseIds = new Map(active.map((pkg) => [`${pkg.repo.id}|${pkg.pkgname}`, pkg.id]));
    const uncovered: { pkg: Package; analysis: PackageElfAnalysis; brokenSince: Date }[] = [];
    for (const pkg of active) {
      const brokenSince = missedBreaks.get(pkg.id);
      const analysis = analyses.get(pkg.id);
      if (!brokenSince || !analysis || pkg.skipSignalScan) continue;

      const pkgbaseId = pkgbaseIds.get(`${pkg.repo.id}|${pkgbaseOf(pkg)}`) ?? pkg.id;
      const alreadyBumped = await this.bumpedSince(pkgbaseId, brokenSince);
      if (!alreadyBumped) {
        uncovered.push({ pkg, analysis, brokenSince });
      }
    }

    return uncovered;
  }

  private async findRemovedProviderSonames(
    active: Package[],
    latest: Map<number, PackageElfAnalysis>,
  ): Promise<RebuildCoverageReport['removedProviderSonames']> {
    const [{ providedByPkgname }, removedPkgs] = await Promise.all([
      this.loadSonameProviders(),
      this.archlinuxPackageRepository.find({
        where: { deactivatedAt: Not(IsNull()) },
        select: { id: true, pkgname: true },
      }),
    ]);
    const removedNames = new Map(removedPkgs.map((pkg) => [pkg.id, pkg.pkgname]));
    const removedAnalyses = await this.loadRemovedArchAnalyses([...removedNames.keys()]);
    const removedProvidersBySoname = new Map<string, Set<string>>();
    for (const analysis of removedAnalyses) {
      for (const soname of analysis.providedSonames) {
        if (providedByPkgname.has(soname)) continue;

        const providers = removedProvidersBySoname.get(soname) ?? new Set<string>();
        providers.add(removedNames.get(analysis.pkgId) ?? String(analysis.pkgId));
        removedProvidersBySoname.set(soname, providers);
      }
    }

    const consumersBySoname = new Map<string, string[]>();
    for (const pkg of active) {
      for (const soname of latest.get(pkg.id)?.neededSonames ?? []) {
        if (!removedProvidersBySoname.has(soname)) continue;

        const consumers = consumersBySoname.get(soname);
        if (consumers) {
          consumers.push(pkg.pkgname);
        } else {
          consumersBySoname.set(soname, [pkg.pkgname]);
        }
      }
    }

    const report: RebuildCoverageReport['removedProviderSonames'] = [];
    for (const [soname, consumers] of consumersBySoname) {
      const removedProviders = Array.from(removedProvidersBySoname.get(soname) ?? []);
      report.push({ soname, removedProviders, consumers });
    }

    return report;
  }

  private async loadRemovedArchAnalyses(pkgIds: number[]): Promise<ProvidedAnalysis[]> {
    if (pkgIds.length === 0) return [];

    const rows = await this.elfAnalysisRepository.find({
      where: { pkgType: pkgTypeOf(TriggerType.ARCH), pkgId: In(pkgIds) },
      select: { pkgId: true, version: true, providedSonames: true, providedVersionNodes: true },
    });

    return [...latestAnalysisByKey(rows, (row) => String(row.pkgId)).values()];
  }

  private async bumpedSince(pkgId: number, since: Date): Promise<boolean> {
    const bumps = await this.packagesRepository.manager.find(PackageBump, {
      where: { pkg: { id: pkgId }, timestamp: MoreThanOrEqual(since) },
      select: { id: true },
      take: 1,
    });

    return bumps.length > 0;
  }

  private async currentBrokenDependencies(consumer: PackageElfAnalysis): Promise<BrokenDependency[]> {
    const [{ providedByPkgname }, runtimes] = await Promise.all([
      this.loadSonameProviders(),
      loadRuntimeVersions(this.archlinuxPackageRepository),
    ]);
    return findBrokenDependencies({
      neededSonames: consumer.neededSonames,
      files: consumer.files,
      providedSonames: new Set(providedByPkgname.keys()),
      runtimes,
      selfProvidedSonames: consumer.providedSonames,
    });
  }

  /**
   * The runtime package for a stale runtime directory, else the last provider of a missing soname. Never the consumer itself.
   */
  private async blameMissedBreak(
    deps: BrokenDependency[],
    outputs: Package[],
  ): Promise<{ owner: ChangedOwner; triggerFrom: TriggerType } | null> {
    const ownIds = new Set(outputs.map((pkg) => pkg.id));
    for (const dep of deps) {
      if (dep.kind === 'runtime' && dep.runtime) {
        const runtimePkg = await this.archlinuxPackageRepository.findOne({ where: { pkgname: dep.runtime } });
        if (runtimePkg) return { owner: runtimePkg, triggerFrom: TriggerType.ARCH };
      }

      if (dep.kind === 'soname' && dep.soname) {
        const provider = await this.lastProviderOf(dep.soname, ownIds);
        if (provider) return provider;
      }
    }

    return null;
  }

  private async lastProviderOf(
    soname: string,
    ownIds: Set<number>,
  ): Promise<{ owner: ChangedOwner; triggerFrom: TriggerType } | null> {
    const providers = await this.elfAnalysisRepository.find({
      where: {
        providedSonames: Raw((alias) => `${alias} @> CAST(:soname AS jsonb)`, { soname: JSON.stringify([soname]) }),
      },
      select: { pkgType: true, pkgId: true, scannedAt: true },
      order: { scannedAt: 'DESC' },
    });

    const archType = pkgTypeOf(TriggerType.ARCH);
    const provider = providers.find((row) => row.pkgType === archType || !ownIds.has(row.pkgId));
    if (!provider) return null;

    if (provider.pkgType === archType) {
      const owner = await this.archlinuxPackageRepository.findOne({ where: { id: provider.pkgId } });
      return owner ? { owner, triggerFrom: TriggerType.ARCH } : null;
    }

    const owner = await this.packagesRepository.findOne({ where: { id: provider.pkgId } });
    return owner ? { owner, triggerFrom: TriggerType.CHAOTIC } : null;
  }
}

/**
 * A break that started after the scan happened after the build.
 */
export function missedBreaksIn(latestAnalyses: Map<number, PackageElfAnalysis>): MissedBreaks {
  const missed: MissedBreaks = new Map();
  for (const [pkgId, analysis] of latestAnalyses) {
    if (analysis.broken && analysis.brokenSince && analysis.brokenSince > analysis.scannedAt) {
      missed.set(pkgId, analysis.brokenSince);
    }
  }

  return missed;
}

function brokenDepsTrigger(
  broken: { deps: BrokenDependency[]; archPkg: ChangedOwner },
  triggerFrom: TriggerType,
): DetectedTrigger {
  return {
    bumpType: BumpType.BROKEN_DEPS,
    archPkg: broken.archPkg,
    triggerFrom,
    reason: 'broken dependency',
    details: broken.deps.map(formatBrokenDependency),
  };
}

function pluginBreakTrigger(
  breaks: ConsumerAbiBreak[],
  owner: ChangedOwner,
  triggerFrom: TriggerType,
): DetectedTrigger {
  return {
    bumpType: BumpType.PLUGIN,
    archPkg: owner,
    triggerFrom,
    reason: `plugin ABI break of ${owner.pkgname}`,
    details: Array.from(new Set(breaks.map(formatConsumerAbiBreak))),
  };
}

function reachableFrom(closure: DependencyClosure | null, consumerDeps: string[] | null): Set<string> | null {
  if (consumerDeps === null) return null;

  const reachable = closure ? closure.reachablePackages(consumerDeps) : new Set<string>();
  for (const dep of consumerDeps) {
    reachable.add(dep);
  }

  return reachable;
}

/**
 * Only a package that provided the soname before and does not provide it now
 * broke the consumer. A package that still ships it (a routine harfbuzz
 * rebuild) is not to blame.
 */
function brokenDependencyCulprit(dep: BrokenDependency, ctx: BrokenDepsContext): ChangedOwner | undefined {
  if (dep.kind === 'soname' && dep.soname) {
    const soname = dep.soname;
    return ctx.changed.find(
      (pkg) =>
        ctx.previousProvidedByPkg.get(pkg.id)?.has(soname) &&
        !(ctx.currentProvidedByPkg.get(pkg.id)?.has(soname) ?? false),
    );
  }

  if (dep.kind === 'runtime' && dep.runtime) {
    return ctx.changed.find((pkg) => isArchOwner(pkg) && pkg.pkgname === dep.runtime && pkg.previousVersion);
  }

  return undefined;
}

/**
 * A soname can stay identical while its version nodes are re-versioned
 * (onnxruntime VERS_1.28.0 -> VERS_1.29.0). The consumer still links the
 * soname, but the version node it needs no longer exists, so it cannot load.
 * Blame a changed package that provided the soname before and now, and that
 * dropped a required node. When the consumer's deps are known, the package
 * must also be in its dependency closure (llvm pulls in llvm-libs), to avoid
 * false attribution (e.g. smolvm bumping unrelated packages).
 */
function findVersionNodeCulprit(
  soname: string,
  requiredNodes: string[],
  ctx: BrokenDepsContext,
  reachable: Set<string> | null,
): { culprit: ChangedOwner; versionNodes: string[] } | null {
  const restrictToDeps = reachable !== null && reachable.size > 0;
  for (const pkg of ctx.changed) {
    if (!ctx.previousProvidedByPkg.get(pkg.id)?.has(soname)) continue;

    if (!(ctx.currentProvidedByPkg.get(pkg.id)?.has(soname) ?? false)) continue;

    if (restrictToDeps && !depsContains(reachable, pkg.pkgname)) continue;

    const missing = findVersionNodeBreaks({
      neededVersionNodes: { [soname]: requiredNodes },
      providerVersionNodes: ctx.currentVersionNodesByPkg.get(pkg.id) ?? {},
    });

    if (missing.length > 0) return { culprit: pkg, versionNodes: missing[0].versionNodes };
  }

  return null;
}

function ownerBreakEntry(
  owner: OwnerDescriptor,
  previous: PackageElfAnalysis,
  current: PackageElfAnalysis,
): PluginBreakIndexEntry | null {
  const symbolBreaks: PluginBreakEntry[] = [];
  for (const [soname, previousSymbols] of Object.entries(previous.exportedSymbols ?? {})) {
    /**
     * A soname rename (python 3.13->3.14 renames libpython3.13 to 3.14) is a
     * BROKEN_DEPS/soname concern, not symbol loss: only the exported *set* of a
     * still-present soname may have changed. Without this a single rename would
     * be reported as hundreds of fake symbol breaks.
     */
    if (!(soname in current.exportedSymbols)) continue;

    const currentSet = new Set(current.exportedSymbols?.[soname] ?? []);
    const lostSymbols: string[] = previousSymbols.filter((symbol) => !currentSet.has(symbol));
    if (lostSymbols.length > 0) {
      symbolBreaks.push({ pkgname: owner.pkgname, pkgId: owner.pkgId, soname, lostSymbols });
    }
  }

  const vtableDrifts = findVtableDrifts(previous.vtables ?? {}, current.vtables ?? {});
  if (symbolBreaks.length === 0 && vtableDrifts.length === 0) return null;

  return { pkgname: owner.pkgname, pkgId: owner.pkgId, symbolBreaks, vtableDrifts };
}

function ownerPairKey(owner: OwnerDescriptor): string {
  return `${pkgTypeOf(owner.pkgType)}|${owner.pkgId}`;
}

function findDroppedSonames(
  previousProvidedByPkg: Map<number, Set<string>>,
  currentProvidedByPkg: Map<number, Set<string>>,
): Set<string> {
  const dropped = new Set<string>();
  for (const [pkgId, previous] of previousProvidedByPkg) {
    const current = currentProvidedByPkg.get(pkgId) ?? new Set<string>();
    for (const soname of previous) {
      if (!current.has(soname)) {
        dropped.add(soname);
      }
    }
  }

  return dropped;
}

function toOwnerDescriptor(pkg: ArchlinuxPackage): OwnerDescriptor {
  return {
    pkgType: TriggerType.ARCH,
    pkgId: pkg.id,
    pkgname: pkg.pkgname,
    previousVersion: pkg.previousVersion ?? undefined,
    currentVersion: pkg.version ?? '',
  };
}
