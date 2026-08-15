import type { ParsedPackageMetadata } from '@chaotic-next/shared-lib';
import type { Package } from '../builder/builder.entity';
import type { ArchlinuxPackage } from '../repo-manager/repo-manager.entity';

export interface RepoWorkDir {
  name: string;
  path: string;
  workDir: string;
}

export interface ParsedPackage {
  base: string;
  pkgrel: number;
  version: string;
  name: string;
  repoName: string;
  metaData: ParsedPackageMetadata;
}

export interface RepoSettings {
  regenDatabase: boolean;
  /** Dry-run the plugin ABI break channel (log only, no rebuild). */
  abiDryRun: boolean;
  /** Arch mirror base URL, also used as the build mirror and for package downloads. */
  mirrorUrl?: string;
  /** Whether the ELF signal scanner is active. */
  signalScanEnabled?: boolean;
}

export interface RepoUpdateRunParams {
  archPkg: ArchlinuxPackage | Package;
  bumpType: BumpType;
  configs: CiConfigs;
  pkg: Package;
  triggerFrom: TriggerType;
  gotBumped?: boolean;
  details?: string[];
  /** Rewritten `.CI/config` content produced by bumpSinglePackage, forwarded to the writer. */
  bumpedConfigContent?: string;
}

/** Key/value pairs from a `.CI/config` file; a value is undefined for lines without `=`. */
type CiConfigs = { [key: string]: string | undefined };

export interface BumpResult {
  bumped: PackageBumpEntry[];
  repo: string;
  origin: TriggerType;
}

/** Outcome of a full-repo indexing run. */
export interface IndexResult {
  /** Number of packages that were downloaded and scanned. */
  scanned: number;
  /** Number of packages skipped (already indexed for their version). */
  skipped: number;
  /** Number of packages that failed to download or scan. */
  failed: number;
}

/** A single package that needs to be downloaded and scanned during indexing. */
export interface IndexCandidate {
  /** pkg.id of a Package (CHAOTIC) or ArchlinuxPackage (ARCH) row. */
  pkgId: number;
  version: string;
  filename: string;
  downloadUrl: string;
  pkgType: TriggerType;
}

export interface PackageConfig {
  configs: CiConfigs;
  pkgInDb: Package;
}

export interface PackageBumpEntry {
  pkg: Package;
  bumpType: BumpType;
  trigger: number;
  triggerName?: string;
  triggerFrom: TriggerType;
  details?: string[];
}

export enum BumpType {
  EXPLICIT = 0,
  GLOBAL = 1,
  FROM_DEPS = 2,
  FROM_DEPS_CHAOTIC = 3,
  PLUGIN = 6,
  /** A package newly links a soname nobody provides or ships stale runtime dirs. */
  BROKEN_DEPS = 7,
}

export enum TriggerType {
  ARCH = 0,
  CHAOTIC = 1,
}

export interface BumpLogEntry {
  bumpType: BumpType;
  pkgname: string;
  trigger: string;
  triggerFrom: TriggerType;
  timestamp: string;
  details?: string[];
}

/**
 * A symbol-level ABI break: a package imports a dynamic symbol from another
 * package's library, and the new version of the owner no longer exports it.
 * This is the signal that catches plugin breaks (kwin) that a soname diff
 * misses, because the soname ("libkwin.so=6-64") stays identical.
 */
export interface SymbolBreak {
  /** The symbol that disappeared from the owner's exports. */
  symbol: string;
  /** The library the symbol was imported from, e.g. "libkwin.so.6". */
  soname: string;
  /** The updated Arch package that broke the symbol. */
  pkgname: string;
  pkgId: number;
}

/**
 * A vtable-layout break: the owner reordered/inserted/removed a virtual slot,
 * so a consumer that imports the shifted slot target is no longer ABI-safe even
 * though the slot method is still exported. See findVtableBreaks in signal.ts.
 */
export interface VtableBreak {
  /** The shifted virtual-slot target symbol the consumer imports. */
  slot: string;
  /** The mangled vtable symbol that drifted, e.g. "_ZTVN4KWin6EffectE". */
  vtable: string;
  /** The updated Arch package that broke the vtable layout. */
  pkgname: string;
  pkgId: number;
}

/** The kinds of ABI break a consumer can suffer after an owner updates. */
export type ConsumerAbiBreak = SymbolBreak | VtableBreak;

/**
 * A symbol-level ABI break of an updated Arch package, keyed by the affected
 * soname (the library that lost symbols).
 */
export interface PluginBreakEntry {
  pkgname: string;
  pkgId: number;
  soname: string;
  /** Symbols that the new version no longer exports. */
  lostSymbols: string[];
}

/**
 * A vtable whose layout drifted between an owner's previous and current
 * version. `shiftedSlots` are the slot-target symbols that no longer hold their
 * old index (the tail after the first mismatch); a consumer importing any of
 * them must rebuild.
 */
interface VtableDrift {
  /** The mangled vtable symbol, e.g. "_ZTVN4KWin6EffectE". */
  vtable: string;
  /** The slot-target symbols whose position changed. */
  shiftedSlots: string[];
}

/**
 * All ABI breaks of one updated owner package, keyed by its owner key (see
 * encodeOwnerKey). Both the symbol loss and the vtable-layout drift of that
 * owner's changed libraries. Owner identity is duplicated on the entry so a
 * vtable break (which has no soname) can still name the culprit.
 */
export interface PluginBreakIndexEntry {
  pkgname: string;
  pkgId: number;
  /** Symbol-level breaks, one per affected soname. */
  symbolBreaks: PluginBreakEntry[];
  /** Vtable-layout drifts across all shipped shared objects. */
  vtableDrifts: VtableDrift[];
}

/**
 * A package whose version changed, described only by the fields the ABI break
 * detection needs. Used for both Arch and Chaotic owners so the same detection
 * covers arch->chaotic and chaotic->chaotic triggers.
 */
export interface OwnerDescriptor {
  pkgType: TriggerType;
  pkgId: number;
  pkgname: string;
  previousVersion?: string;
  currentVersion: string;
}

/**
 * One package flagged broken by the ELF signal scanner (GET /repo/broken).
 * Only Chaotic packages are ever reported: Arch packages are reference data
 * (Chaotic depends on their sonames) and are never judged "broken".
 */
export interface BrokenPackageReport {
  pkgType: 'chaotic';
  pkgname: string;
  version: string;
  repoName?: string;
  reasons: string[];
}

/** A package that can be a rebuild-trigger source, across both namespaces. */
export interface RebuildTriggerSourcePackage {
  pkgname: string;
  pkgType: 'arch' | 'chaotic';
}

/** One soname a package links and every indexed package that provides it. */
export interface SonameDependency {
  soname: string;
  providers: RebuildTriggerSourcePackage[];
}

/**
 * What can cause a Chaotic package to be rebuilt (GET /repo/dependencies/:pkgname),
 * per trigger channel: explicit CI_REBUILD_TRIGGERS, the soname providers it
 * links (broken-deps channel) and the owners it is a plugin of (plugin ABI
 * channel). Explicit triggers are read live from `.CI/config`; the rest come
 * from persisted data.
 */
export interface PackageRebuildTriggerSources {
  pkgname: string;
  /** Arch packages listed in the package's CI_REBUILD_TRIGGERS (read live from `.CI/config`). */
  explicitTriggers: { pkgname: string; archVersion: string }[];
  /** Sonames the package links and who provides them (a dropped provider triggers BROKEN_DEPS). */
  sonameDependencies: SonameDependency[];
  /** Owners this package is a plugin of; their ABI change triggers PLUGIN. */
  pluginOwners: RebuildTriggerSourcePackage[];
}
