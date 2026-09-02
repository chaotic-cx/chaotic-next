import { z } from 'zod';
import { buildClassSuggestionSchema } from './core';

export const parsedPackageMetadataSchema = z.object({
  buildDate: z.string(),
  checkDepends: z.array(z.string()).optional(),
  conflicts: z.array(z.string()).optional(),
  deps: z.array(z.string()).optional(),
  desc: z.string().optional(),
  filename: z.string(),
  license: z.string().optional(),
  makeDeps: z.array(z.string()).optional(),
  optDeps: z.array(z.string()).optional(),
  packager: z.string().optional(),
  provides: z.array(z.string()).optional(),
  replaces: z.array(z.string()).optional(),
  soNameList: z.array(z.string()).optional(),
  url: z.string().optional(),
});
export type ParsedPackageMetadata = z.infer<typeof parsedPackageMetadataSchema>;

export const packageSchema = z.object({
  id: z.number(),
  pkgname: z.string(),
  lastUpdated: z.string().optional(),
  createdAt: z.string().optional(),
  isActive: z.boolean(),
  skipSignalScan: z.boolean().optional(),
  version: z.string().optional(),
  bumpCount: z.number().optional(),
  bumpTriggers: z.array(z.object({ pkgname: z.string(), archVersion: z.string() })).optional(),
  metadata: parsedPackageMetadataSchema.optional(),
  pkgrel: z.number().optional(),
  bump: z.number().optional(),
  /** Build class configured in the package's .CI/config, null while unknown. */
  buildClass: z.number().nullable().optional(),
  /** PKGBUILD pkgbase this package belongs to; differs from pkgname for split packages. */
  pkgbaseName: z.string().nullable().optional(),
  repo: z.number().optional(),
  /** Repository name, resolved server-side when the repo relation is joined. */
  reponame: z.string().optional(),
  /** Whether the package's unresolved build failure is silenced; resolved server-side for admin views. */
  failureSilenced: z.boolean().optional(),
  /**
   * Build class derived from the package's averaged build resource usage,
   * resolved server-side for admin views; null when nothing was ever sampled.
   */
  buildClassSuggestion: buildClassSuggestionSchema
    .pick({ averages: true, samples: true, suggestedBuildClass: true })
    .nullable()
    .optional(),
});
export type Package = z.infer<typeof packageSchema>;

export const PACKAGE_SORT_FIELDS = [
  'id',
  'pkgname',
  'lastUpdated',
  'createdAt',
  'version',
  'pkgrel',
  'buildClass',
  'pkgbaseName',
  'repo',
] as const;
export type PackageSortField = (typeof PACKAGE_SORT_FIELDS)[number];

export function isPackageSortField(value: string): value is PackageSortField {
  return (PACKAGE_SORT_FIELDS as readonly string[]).includes(value);
}

export const packageElfAnalysisSchema = z.object({
  version: z.string(),
  /** e.g. "usr/lib/qt6/plugins/kwin/effects/plugins/better_blur_dx.so" */
  files: z.array(z.string()),
  /** DT_NEEDED sonames of every ELF object in the package. */
  neededSonames: z.array(z.string()),
  /** SONAME of every shipped .so file. */
  providedSonames: z.array(z.string()),
  /**
   * Dynamic symbols the package imports (undefined symbols of its shipped
   * ELF objects), deduplicated. Kept flat on purpose: attributing each symbol
   * to a specific linked library requires dynamic resolution; instead the bump
   * logic intersects this set with the owner's old/new exports per soname.
   */
  importedSymbols: z.array(z.string()),
  /**
   * Dynamic symbols each shipped .so exports, keyed by the .so's SONAME
   * (from nm -D --defined-only).
   */
  exportedSymbols: z.record(z.string(), z.array(z.string())),
  /**
   * ELF symbol version nodes each shipped .so defines, keyed by the .so's SONAME
   * (from `readelf -VW` version-definition section). A consumer that links the
   * soname and requires one of these nodes breaks when the node disappears.
   */
  providedVersionNodes: z.record(z.string(), z.array(z.string())),
  /**
   * ELF symbol version nodes this package requires from each linked soname,
   * keyed by the soname (from `readelf -VW` version-needs section).
   */
  neededVersionNodes: z.record(z.string(), z.array(z.string())),
  /**
   * Per-vtable layout of the exported virtual-slot lists, keyed by the mangled
   * vtable symbol (e.g. `_ZTVN4KWin6EffectE`) and valued by the ordered list of
   * slot-target symbols. Derived from `readelf -rW` + `nm -D -S --defined-only`.
   * A vtable whose layout drifts (reorder/mid-insertion/removal, not a pure
   * append) breaks every consumer that imports a shifted slot.
   */
  vtables: z.record(z.string(), z.array(z.string())),
  /** Parent directory of every shipped file. */
  directoriesOwned: z.array(z.string()),
  /**
   * The direct parent directories of the shipped files (real ownership). Used
   * to distinguish "this package installs files directly into an owner's dir"
   * from mere transitive ancestor ownership when detecting plugins.
   */
  directDirectories: z.array(z.string()),
  /**
   * Other packages this package is a plugin of: directories it installs files
   * into that another package owns (e.g. kwin's usr/lib/qt6/plugins/kwin/).
   */
  pluginOf: z.array(z.string()),
  /**
   * Whether the package is broken in the current repo state: it links a soname
   * nobody provides (dropped/renamed dependency) or ships files under a stale
   * python/perl/ruby/ghc version directory.
   */
  broken: z.boolean(),
  /** Empty when not broken. */
  brokenReasons: z.array(z.string()),
  /**
   * Whether this package contains compiled ELF code (binaries/libraries) that
   * can be analyzed for ABI compatibility.
   */
  hasCompiledCode: z.boolean(),
  /**
   * Whether this package is compiled from source (as opposed to being a
   * binary package that repackages prebuilt binaries).
   */
  isSourceCompiled: z.boolean(),
  scannedAt: z.string(),
});
export type PackageElfAnalysis = z.infer<typeof packageElfAnalysisSchema>;

export const adminPackageElfAnalysisSchema = z.object({
  id: z.number().describe('Record ID'),
  pkgType: z.enum(['0', '1']).describe('Package type (0 for Arch, 1 for Chaotic)'),
  pkgId: z.number().describe('ID of the analysed package'),
  pkgname: z.string().optional().describe('Name of the analysed package'),
  version: z.string().describe('Version of the analysed package'),
  broken: z.boolean().describe('Whether the package was flagged broken'),
  brokenReasons: z.array(z.string()).describe('Reasons the package was flagged broken'),
  hasCompiledCode: z.boolean().describe('Whether the package ships compiled ELF code'),
  isSourceCompiled: z.boolean().describe('Whether the package is compiled from source'),
  scannedAt: z.string().describe('When the package was scanned (ISO 8601)'),
});
export type AdminPackageElfAnalysis = z.infer<typeof adminPackageElfAnalysisSchema>;

/**
 * One package flagged broken by the ELF signal scanner. Only Chaotic packages
 * are ever reported: Arch packages are reference data and never judged broken.
 */
export const brokenPackageReportSchema = z.object({
  pkgType: z.literal('chaotic').describe('Package type (always "chaotic" for broken reports)'),
  pkgname: z.string().describe('Package name'),
  version: z.string().describe('Package version'),
  repoName: z.string().optional().describe('Repository name'),
  reasons: z.array(z.string()).describe('Reasons the package is flagged broken'),
});
export type BrokenPackageReport = z.infer<typeof brokenPackageReportSchema>;

/** Outcome of one background ELF-signal rescan, served by GET /admin/rescan/:jobId. */
export const rescanJobSchema = z.object({
  jobId: z.string(),
  status: z.enum(['running', 'done']),
  startedAt: z.string(),
  /** Null until the job finished. */
  finishedAt: z.string().nullable(),
  rescanned: z.number(),
  /** Per-package failure reasons ("pkgname: reason"). */
  failed: z.array(z.string()),
});
export type RescanJob = z.infer<typeof rescanJobSchema>;

export const rebuildTriggerSourcePackageSchema = z.object({
  pkgname: z.string().describe('Package name'),
  pkgType: z.enum(['arch', 'chaotic']).describe('Package type'),
});
export type RebuildTriggerSourcePackage = z.infer<typeof rebuildTriggerSourcePackageSchema>;

export const sonameDependencySchema = z.object({
  soname: z.string().describe('Shared object name (soname)'),
  providers: z.array(rebuildTriggerSourcePackageSchema).describe('Packages that provide this soname'),
});
export type SonameDependency = z.infer<typeof sonameDependencySchema>;

export const packageRebuildTriggerSourcesSchema = z.object({
  pkgname: z.string().describe('Package name'),
  explicitTriggers: z
    .array(
      z.object({
        pkgname: z.string().describe('Package name listed in CI_REBUILD_TRIGGERS'),
        archVersion: z.string().describe('Arch version of the trigger package'),
      }),
    )
    .describe('Explicit rebuild triggers from .CI/config'),
  sonameDependencies: z.array(sonameDependencySchema).describe('Soname-based dependency links'),
  pluginOwners: z.array(rebuildTriggerSourcePackageSchema).describe('Packages this package is a plugin of'),
});
export type PackageRebuildTriggerSources = z.infer<typeof packageRebuildTriggerSourcesSchema>;

export interface IndexResult {
  scanned: number;
  skipped: number;
  failed: number;
}

export const archPackageSchema = z.object({
  id: z.number(),
  pkgname: z.string(),
  version: z.string().optional(),
  pkgrel: z.number().optional(),
  arch: z.string().optional(),
  lastUpdated: z.string().optional(),
  previousVersion: z.string().nullable().optional(),
  metadata: parsedPackageMetadataSchema.optional(),
});
export type ArchPackage = z.infer<typeof archPackageSchema>;
