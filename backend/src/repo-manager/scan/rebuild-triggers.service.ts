import { Package, Repo } from '../../builder/builder.entity';
import {
  BumpType,
  ConsumerAbiBreak,
  OwnerDescriptor,
  PluginBreakEntry,
  PluginBreakIndexEntry,
  RepoSettings,
  RepoUpdateRunParams,
  TriggerType,
  type PackageConfig,
} from '../../interfaces/repo-manager';
import { BumpService, isCiFlagEnabled } from '../bump';
import { ArchlinuxPackage, PackageElfAnalysis } from '../repo-manager.entity';
import { type RepoReader } from '../repo-rw';
import {
  compareArchVersions,
  encodeOwnerKey,
  findBrokenDependencies,
  findVtableDrifts,
  formatBrokenDependency,
  formatConsumerAbiBreak,
  latestAnalysisByKey,
  pkgTypeOf,
  sameLibraryFamily,
  type BrokenDependency,
  type RuntimeName,
} from '../signal';
import { latestAnalysesByPackage } from './latest-analyses';
import { loadRuntimeVersions } from './runtime-versions';
import { yieldToEventLoop } from '../../utils/functions';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PinoLogger } from 'nestjs-pino';
import { In, Repository } from 'typeorm';

/** CI config flag keys (read from .CI/config); a flag is on when set to "1". */
export const CI_FLAG_REBUILD_IGNORE_ABI = 'CI_REBUILD_IGNORE_ABI';

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

/** How many detail entries a rebuild's log line / commit message keeps before "…". */
const ABI_BREAK_DETAILS_LIMIT = 1;

/** How many pkgIds one `IN (...)` analysis query may contain, to bound result-set size. */
const ANALYSIS_QUERY_BATCH_SIZE = 500;

/** Yield to the event loop every N consumer packages; each ABI check is pure CPU. */
const YIELD_EVERY = 10;

export function summarizeDetails(details: string[]): string[] {
  if (details.length <= ABI_BREAK_DETAILS_LIMIT) return details;
  const kept = details.slice(0, ABI_BREAK_DETAILS_LIMIT);
  kept.push(`... ${details.length - ABI_BREAK_DETAILS_LIMIT} more`);
  return kept;
}

/**
 * Per-run shared state for broken-deps detection. Built once from the current
 * Arch update set and reused across every consumer, so the provided-soname
 * index, runtime versions and previous-provided lookup run once, not per package.
 */
interface BrokenDepsContext {
  changed: ArchlinuxPackage[];
  /** soname -> set of provider pkgnames (real providers, latest analysis per package). */
  providedByPkgname: Map<string, Set<string>>;
  /** Sonames any current Arch package provides; pacman resolves these transitively. */
  archProvidedSonames: Set<string>;
  runtimes: Partial<Record<RuntimeName, string | null>>;
  previousProvidedByPkg: Map<number, Set<string>>;
  currentProvidedByPkg: Map<number, Set<string>>;
}

/**
 * Decides which Chaotic packages need a rebuild for a run: global triggers,
 * newly-broken dependencies, and plugin ABI breaks (symbol loss + vtable drift)
 * against the changed Arch/Chaotic owners. Explicit `CI_REBUILD_TRIGGERS` are
 * deliberately excluded — the pkgbuilds CI already rebuilds on those, so bumping
 * again here would double-trigger.
 */
@Injectable()
export class RebuildTriggerService {
  constructor(
    @InjectRepository(PackageElfAnalysis)
    private readonly elfAnalysisRepository: Repository<PackageElfAnalysis>,
    @InjectRepository(ArchlinuxPackage)
    private readonly archlinuxPackageRepository: Repository<ArchlinuxPackage>,
    @InjectRepository(Package)
    private readonly packagesRepository: Repository<Package>,
    private readonly bumpService: BumpService,
    private readonly pino: PinoLogger,
  ) {}

  async checkRebuildTriggers(
    reader: RepoReader,
    pkgbaseDirs: string[],
    repo: Repo,
    changed: ArchlinuxPackage[],
    settings: RepoSettings,
  ): Promise<RepoUpdateRunParams[]> {
    const needsRebuild: RepoUpdateRunParams[] = [];

    // Index symbol-level and vtable-layout ABI breaks of updated Arch packages;
    // this catches plugin (kwin) breaks while the soname stays identical.
    const signalEnabled = settings.signalScanEnabled;
    const pluginBreakIndex: Map<string, PluginBreakIndexEntry> = signalEnabled
      ? await this.buildPluginBreakIndex(changed.map(toOwnerDescriptor))
      : new Map();

    // Preload the per-run shared state and latest consumer analyses once,
    // instead of one query per chaotic package inside the loop.
    const brokenDepsCtx = signalEnabled ? await this.buildBrokenDepsContext(changed) : null;
    const activePkgIds = (await this.packagesRepository.find({ where: { isActive: true }, select: { id: true } })).map(
      (p) => p.id,
    );
    const consumerAnalyses = signalEnabled
      ? await this.loadLatestChaoticAnalyses(activePkgIds)
      : new Map<number, PackageElfAnalysis>();

    for (const [dirIndex, pkgbaseDir] of pkgbaseDirs.entries()) {
      if (dirIndex % YIELD_EVERY === 0) await yieldToEventLoop();
      const pkgConfig: PackageConfig = await this.bumpService.readPackageConfig(reader, { pkgbaseDir, repo });
      let foundTrigger = false;

      // Binary-only packages are never rebuilt from source, so no trigger
      // channel can meaningfully apply.
      const participatesInSignalScan = !pkgConfig.pkgInDb.skipSignalScan;

      // Rebuild packages that newly became broken: they link a soname this run's
      // Arch updates stopped providing, or ship files under a runtime version dir
      // that no longer matches the repo's current runtime (e.g. python 3.12->3.13).
      // This is the static equivalent of checkrebuild's `ldd "not found"` scan.
      if (
        !foundTrigger &&
        participatesInSignalScan &&
        brokenDepsCtx &&
        !isCiFlagEnabled(pkgConfig.configs, CI_FLAG_REBUILD_IGNORE_ABI)
      ) {
        const consumerAnalysis = consumerAnalyses.get(pkgConfig.pkgInDb.id);
        const consumerDeps = pkgConfig.pkgInDb.metadata?.deps ?? [];
        const broken = consumerAnalysis
          ? this.brokenDepsForConsumer(consumerAnalysis, brokenDepsCtx, consumerDeps)
          : null;
        if (broken) {
          const { deps, archPkg } = broken;
          const entry = this.buildRebuildEntry({
            pkgConfig,
            archPkg,
            bumpType: BumpType.BROKEN_DEPS,
            reason: 'broken dependency',
            details: deps.map(formatBrokenDependency),
            pkgbaseDir,
            settings,
            triggerFrom: TriggerType.ARCH,
          });
          if (entry) needsRebuild.push(entry);
          foundTrigger = true;
        }
      }

      // Rebuild packages that are plugins of an updated Arch package and import
      // symbols the new version no longer exports (kwin-style, soname identical).
      if (
        !foundTrigger &&
        participatesInSignalScan &&
        pluginBreakIndex.size > 0 &&
        !isCiFlagEnabled(pkgConfig.configs, CI_FLAG_REBUILD_IGNORE_ABI)
      ) {
        const consumerAnalysis = consumerAnalyses.get(pkgConfig.pkgInDb.id);
        const triggers: ConsumerAbiBreak[] = consumerAnalysis
          ? this.consumerSymbolBreaksFor(consumerAnalysis, pluginBreakIndex)
          : [];
        const trigger = triggers[0];
        if (trigger) {
          const entry = this.buildRebuildEntry({
            pkgConfig,
            archPkg: changed.find((pkg) => pkg.id === trigger.pkgId),
            bumpType: BumpType.PLUGIN,
            reason: `plugin ABI break of ${trigger.pkgname}`,
            details: Array.from(new Set(triggers.map(formatConsumerAbiBreak))),
            pkgbaseDir,
            settings,
            triggerFrom: TriggerType.ARCH,
          });
          if (entry) needsRebuild.push(entry);
        }
      }
    }

    this.pino.info({ count: needsRebuild.length, repo: repo.name }, 'Found packages to rebuild');
    return needsRebuild;
  }

  /**
   * Build a rebuild entry for a detected trigger, or null in dry-run mode
   * (logged only) or when no triggering package could be blamed. The
   * reason/detail strings are summarized for the log line and commit message
   * so symbol-loss breaks don't list hundreds of entries.
   */
  buildRebuildEntry(params: {
    pkgConfig: PackageConfig;
    archPkg?: ArchlinuxPackage | Package;
    bumpType: BumpType;
    reason: string;
    details: string[];
    pkgbaseDir: string;
    settings: RepoSettings;
    triggerFrom: TriggerType;
  }): RepoUpdateRunParams | null {
    const logDetails = summarizeDetails(params.details);
    if (params.settings.abiDryRun) {
      this.pino.info(
        { pkgbaseDir: params.pkgbaseDir, reason: params.reason, details: logDetails },
        'Dry-run: would rebuild',
      );
      return null;
    }
    if (!params.archPkg) return null;
    this.pino.debug(
      { pkgbaseDir: params.pkgbaseDir, reason: params.reason, details: logDetails },
      'Rebuilding package',
    );

    return {
      archPkg: params.archPkg,
      configs: params.pkgConfig.configs,
      pkg: params.pkgConfig.pkgInDb,
      bumpType: params.bumpType,
      triggerFrom: params.triggerFrom,
      details: logDetails,
    };
  }

  /**
   * ABI-break index (symbol loss + vtable drift) for the changed owners, keyed
   * by owner key. Works for Arch and Chaotic owners alike, so the same
   * detection covers arch->chaotic and chaotic->chaotic triggers.
   */
  async buildPluginBreakIndex(changed: OwnerDescriptor[]): Promise<Map<string, PluginBreakIndexEntry>> {
    const index: Map<string, PluginBreakIndexEntry> = new Map();
    const withPrevious = changed.filter((owner) => owner.previousVersion);
    if (withPrevious.length === 0) return index;
    this.pino.debug({ owners: withPrevious.length }, 'Building plugin-break index');

    const byType = new Map<'0' | '1', OwnerDescriptor[]>();
    for (const owner of withPrevious) {
      const type = pkgTypeOf(owner.pkgType);
      const list = byType.get(type) ?? [];
      list.push(owner);
      byType.set(type, list);
    }

    // pkgType -> "pkgId|version" -> analysis. Two batched queries per pkgType
    // (previous + current) replace the 2N sequential findOne calls.
    const analysesByType = new Map<'0' | '1', Map<string, PackageElfAnalysis>>();
    for (const [type, owners] of byType) {
      const pick = (version: 'previousVersion' | 'currentVersion'): Promise<PackageElfAnalysis[]> => {
        const ids: number[] = [];
        const versions: string[] = [];
        for (const owner of owners) {
          const v = owner[version];
          if (v) {
            ids.push(owner.pkgId);
            versions.push(v);
          }
        }
        return this.elfAnalysisRepository.find({
          where: { pkgType: type, pkgId: In(ids), version: In(versions) },
        });
      };
      const [previousAll, currentAll] = await Promise.all([pick('previousVersion'), pick('currentVersion')]);
      const map = new Map<string, PackageElfAnalysis>();
      for (const a of [...previousAll, ...currentAll]) map.set(`${a.pkgId}|${a.version}`, a);
      analysesByType.set(type, map);
    }

    for (const owner of withPrevious) {
      const type = pkgTypeOf(owner.pkgType);
      const map = analysesByType.get(type);
      const previous = map?.get(`${owner.pkgId}|${owner.previousVersion}`);
      const current = map?.get(`${owner.pkgId}|${owner.currentVersion}`);
      if (!previous || !current) {
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

      const symbolBreaks: PluginBreakEntry[] = [];
      for (const [soname, previousSymbols] of Object.entries(previous.exportedSymbols ?? {})) {
        // A soname rename (python 3.13->3.14 renames libpython3.13 to 3.14) is a
        // BROKEN_DEPS/soname concern, not symbol loss: only the exported *set* of a
        // still-present soname may have changed. Without this a single rename would
        // be reported as hundreds of fake symbol breaks.
        if (!(soname in current.exportedSymbols)) continue;
        const currentSymbols: string[] = current.exportedSymbols?.[soname] ?? [];
        const currentSet = new Set(currentSymbols);
        const lostSymbols: string[] = previousSymbols.filter((symbol) => !currentSet.has(symbol));
        if (lostSymbols.length > 0) {
          symbolBreaks.push({ pkgname: owner.pkgname, pkgId: owner.pkgId, soname, lostSymbols });
        }
      }

      const vtableDrifts = findVtableDrifts(previous.vtables ?? {}, current.vtables ?? {});
      if (symbolBreaks.length > 0 || vtableDrifts.length > 0) {
        index.set(encodeOwnerKey(owner.pkgType, owner.pkgId), {
          pkgname: owner.pkgname,
          pkgId: owner.pkgId,
          symbolBreaks,
          vtableDrifts,
        });
      }
    }
    return index;
  }

  /** ABI-break index for one just-deployed package; null when no previous analysis exists. */
  async buildDeployedOwnerBreakIndex(pkg: Package): Promise<Map<string, PluginBreakIndexEntry> | null> {
    const analyses = await this.elfAnalysisRepository.find({
      where: { pkgType: pkgTypeOf(TriggerType.CHAOTIC), pkgId: pkg.id },
    });
    if (analyses.length < 2) return null;

    // Pick current/previous by Arch version order, not DB string order (which
    // misorders e.g. 2:13 vs 2:9 or 1.10 vs 1.9).
    const sorted = [...analyses].sort((a, b) => compareArchVersions(b.version, a.version));
    const current = sorted[0];
    const previous = sorted[1];
    return this.buildPluginBreakIndex([
      {
        pkgType: TriggerType.CHAOTIC,
        pkgId: pkg.id,
        pkgname: pkg.pkgname,
        previousVersion: previous.version,
        currentVersion: current.version,
      },
    ]);
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
            pluginOf: true,
          },
        })),
      );
    }
    this.pino.debug({ analyses: rows.length, packages: pkgIds.length }, 'Loaded latest Chaotic analyses');
    // Keep the newest version per package by Arch version order, not DB string
    // order (which misorders e.g. 2:13 vs 2:9 or 1.10 vs 1.9).
    const latest = latestAnalysisByKey(rows, (row) => String(row.pkgId));
    for (const [key, row] of latest) map.set(Number(key), row);
    return map;
  }

  /**
   * Pure ABI-break intersection for one consumer against the plugin break
   * index. No DB access — callers batch-load analyses and reuse the index.
   */
  consumerSymbolBreaksFor(
    consumer: PackageElfAnalysis,
    pluginBreakIndex: Map<string, PluginBreakIndexEntry>,
  ): ConsumerAbiBreak[] {
    const consumerImports: Set<string> = new Set(consumer.importedSymbols ?? []);
    const pluginOf: string[] = consumer.pluginOf ?? [];
    const breaks: ConsumerAbiBreak[] = [];

    for (const ownerKey of pluginOf) {
      const indexEntry = pluginBreakIndex.get(ownerKey);
      if (!indexEntry) continue;

      for (const entry of indexEntry.symbolBreaks) {
        // A consumer that ships its own copy of the library (e.g. python39
        // bundling libpython3.9.so.1.0) resolves those symbols locally, not
        // against the owner's updated soname, so it is not a break victim.
        if (this.selfProvidesLibrary(consumer, entry.soname)) continue;
        for (const symbol of entry.lostSymbols) {
          if (consumerImports.has(symbol)) {
            breaks.push({ symbol, soname: entry.soname, pkgname: entry.pkgname, pkgId: entry.pkgId });
          }
        }
      }
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

  private async buildBrokenDepsContext(changed: ArchlinuxPackage[]): Promise<BrokenDepsContext | null> {
    if (!changed?.length) return null;
    const [{ providedByPkgname, archProvidedSonames }, runtimes, previousRows, currentRows] = await Promise.all([
      this.loadSonameProviders(),
      loadRuntimeVersions(this.archlinuxPackageRepository),
      this.loadProvidedSonameAnalyses(
        changed.flatMap((pkg) => (pkg.previousVersion ? [{ pkgId: pkg.id, version: pkg.previousVersion }] : [])),
      ),
      this.loadProvidedSonameAnalyses(
        changed.flatMap((pkg) => (pkg.version ? [{ pkgId: pkg.id, version: pkg.version }] : [])),
      ),
    ]);
    // Provided-soname/runtimes context is logged by SignalScanService; only the
    // run-specific part is logged here.
    this.pino.debug({ changed: changed.length, previousAnalyses: previousRows.length }, 'Broken-deps context loaded');
    const previousProvidedByPkg = new Map<number, Set<string>>();
    for (const row of previousRows) previousProvidedByPkg.set(row.pkgId, new Set(row.providedSonames));
    const currentProvidedByPkg = new Map<number, Set<string>>();
    for (const row of currentRows) currentProvidedByPkg.set(row.pkgId, new Set(row.providedSonames));
    return {
      changed,
      providedByPkgname,
      archProvidedSonames,
      runtimes,
      previousProvidedByPkg,
      currentProvidedByPkg,
    };
  }

  /**
   * Soname providers from the latest analysis of every known package:
   * `providedByPkgname` maps each soname to its provider names (Arch and
   * Chaotic alike), `archProvidedSonames` collects the sonames any current
   * Arch package provides.
   */
  private async loadSonameProviders(): Promise<{
    providedByPkgname: Map<string, Set<string>>;
    archProvidedSonames: Set<string>;
  }> {
    const [latest, archPkgs, chaoticPkgs] = await Promise.all([
      latestAnalysesByPackage(this.elfAnalysisRepository),
      this.archlinuxPackageRepository.find({ select: { id: true, pkgname: true } }),
      this.packagesRepository.find({ select: { id: true, pkgname: true } }),
    ]);
    const nameById = new Map<string, string>();
    for (const pkg of archPkgs) nameById.set(`0:${pkg.id}`, pkg.pkgname);
    for (const pkg of chaoticPkgs) nameById.set(`1:${pkg.id}`, pkg.pkgname);

    const archType = pkgTypeOf(TriggerType.ARCH);
    const bySoname = new Map<string, Set<string>>();
    const archProvidedSonames = new Set<string>();
    for (const [key, analysis] of latest) {
      const provider = nameById.get(key);
      if (!provider) continue;
      const isArch = analysis.pkgType === archType;
      for (const soname of analysis.providedSonames) {
        if (isArch) archProvidedSonames.add(soname);
        const set = bySoname.get(soname) ?? new Set<string>();
        set.add(provider);
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
   * If no deps are recorded (e.g. test seeds), all providers count so the check
   * is a no-op rather than flagging everything.
   */
  providedForDeps(
    providedByPkgname: Map<string, Set<string>>,
    consumerDeps: string[],
    archProvidedSonames: Set<string>,
  ): Set<string> {
    const satisfied = new Set<string>(archProvidedSonames);
    const deps = new Set(consumerDeps);
    if (deps.size === 0) {
      for (const soname of providedByPkgname.keys()) satisfied.add(soname);
      return satisfied;
    }
    for (const [soname, providers] of providedByPkgname) {
      for (const provider of providers) {
        if (deps.has(provider)) {
          satisfied.add(soname);
          break;
        }
      }
    }
    return satisfied;
  }

  /** Provided sonames of specific Arch package versions (previous + current of the changed set). */
  private async loadProvidedSonameAnalyses(
    entries: { pkgId: number; version: string }[],
  ): Promise<Pick<PackageElfAnalysis, 'pkgId' | 'providedSonames'>[]> {
    if (entries.length === 0) return [];
    return this.elfAnalysisRepository.find({
      where: entries.map((entry) => ({
        pkgType: pkgTypeOf(TriggerType.ARCH),
        pkgId: entry.pkgId,
        version: entry.version,
      })),
      select: { pkgId: true, providedSonames: true },
    });
  }

  private brokenDepsForConsumer(
    consumer: PackageElfAnalysis,
    ctx: BrokenDepsContext,
    consumerDeps: string[],
  ): { deps: BrokenDependency[]; archPkg: ArchlinuxPackage } | null {
    const deps = findBrokenDependencies({
      neededSonames: consumer.neededSonames,
      files: consumer.files,
      providedSonames: this.providedForDeps(ctx.providedByPkgname, consumerDeps, ctx.archProvidedSonames),
      runtimes: ctx.runtimes,
      selfProvidedSonames: consumer.providedSonames,
    });
    if (deps.length === 0) return null;

    const relevant: BrokenDependency[] = [];
    let cause: ArchlinuxPackage | undefined;
    for (const dep of deps) {
      if (dep.kind === 'soname' && dep.soname) {
        const soname = dep.soname;
        // Only a package that previously provided the soname and no longer
        // does actually broke the consumer; blaming one that still ships it
        // (e.g. a routine harfbuzz rebuild) attributes unrelated breakage.
        const culprit = ctx.changed.find(
          (pkg) =>
            ctx.previousProvidedByPkg.get(pkg.id)?.has(soname) &&
            !(ctx.currentProvidedByPkg.get(pkg.id)?.has(soname) ?? false),
        );
        if (culprit) {
          relevant.push(dep);
          cause = cause ?? culprit;
        }
      } else if (dep.kind === 'runtime' && dep.runtime) {
        const runtimePkg = ctx.changed.find((pkg) => pkg.pkgname === dep.runtime && pkg.previousVersion);
        if (runtimePkg) {
          relevant.push(dep);
          cause = cause ?? runtimePkg;
        }
      }
    }

    if (relevant.length === 0 || !cause) return null;
    return { deps: relevant, archPkg: cause };
  }
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
