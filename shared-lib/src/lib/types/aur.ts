import { z } from 'zod';

export type DiffScanSeverity = 'critical' | 'warning' | 'info';

export const diffScanFindingSchema = z.object({
  ruleId: z.string().describe('Rule identifier'),
  ruleName: z.string().describe('Human-readable rule name'),
  severity: z.enum(['critical', 'warning', 'info']).describe('Finding severity'),
  description: z.string().describe('Detailed description of the finding'),
  file: z.string().describe('Source file path where the finding was detected'),
  line: z.number().optional().describe('Line number in the source file'),
  match: z.string().describe('Matched content or pattern'),
});
export type DiffScanFinding = z.infer<typeof diffScanFindingSchema>;

export type VtVerdict = 'malicious' | 'suspicious' | 'clean' | 'unknown';

export const vtEngineStatsSchema = z.object({
  malicious: z.number().describe('Number of engines flagging as malicious'),
  suspicious: z.number().describe('Number of engines flagging as suspicious'),
  undetected: z.number().describe('Number of engines with no detection'),
  harmless: z.number().describe('Number of engines flagging as harmless'),
  timeout: z.number().describe('Number of engines that timed out'),
});
export type VtEngineStats = z.infer<typeof vtEngineStatsSchema>;

export function totalEngines(stats: VtEngineStats): number {
  return stats.malicious + stats.suspicious + stats.undetected + stats.harmless + stats.timeout;
}

export const vtIndicatorReportSchema = z.object({
  type: z.enum(['url', 'file']).describe('Indicator type'),
  value: z.string().describe('The URL or file hash being analysed'),
  context: z.string().describe('Contextual note about this indicator'),
  verdict: z.enum(['malicious', 'suspicious', 'clean', 'unknown']).describe('VirusTotal verdict'),
  stats: vtEngineStatsSchema.optional().describe('Per-engine detection statistics'),
});
export type VtIndicatorReport = z.infer<typeof vtIndicatorReportSchema>;

export const aurRpcPackageSchema = z.object({
  CoMaintainers: z.array(z.string()).nullish().describe('Secondary maintainer account names'),
  Conflicts: z.array(z.string()).nullish().describe('Packages this package conflicts with'),
  Description: z.string().nullish().describe('Human-readable package description'),
  Depends: z.array(z.string()).nullish().describe('Runtime dependency package names (possibly versioned)'),
  FirstSubmitted: z.number().nullish().describe('Unix timestamp of the first submission'),
  ID: z.number().nullish().describe('AUR package ID'),
  Keywords: z.array(z.string()).nullish().describe('Search keywords'),
  LastModified: z.number().nullish().describe('Unix timestamp of the last modification'),
  License: z.array(z.string()).nullish().describe('SPDX license identifiers'),
  Maintainer: z.string().nullish().describe('Primary maintainer account name, or null when orphaned'),
  MakeDepends: z.array(z.string()).nullish().describe('Build-time dependency package names'),
  Name: z.string().nullish().describe('Package name'),
  NumVotes: z.number().nullish().describe('Number of AUR votes'),
  OutOfDate: z.number().nullish().describe('Unix timestamp when flagged out-of-date, or null'),
  PackageBase: z.string().nullish().describe('Package base name (differs from Name for split packages)'),
  PackageBaseID: z.number().nullish().describe('AUR package base ID'),
  Popularity: z.number().nullish().describe('AUR popularity score'),
  Provides: z.array(z.string()).nullish().describe('Virtual packages this package provides'),
  Replaces: z.array(z.string()).nullish().describe('Packages this package replaces'),
  Submitter: z.string().nullish().describe('Account name of the original submitter'),
  URL: z.string().nullish().describe('Project homepage URL'),
  URLPath: z.string().nullish().describe('Path to the cgit snapshot tarball'),
  Version: z.string().nullish().describe('Package version'),
});
export type AurRpcPackage = z.infer<typeof aurRpcPackageSchema>;

export const aurRpcInfoResponseSchema = z.object({
  resultcount: z.number().describe('Number of results'),
  results: z.array(aurRpcPackageSchema).describe('Matching AUR packages'),
  type: z.string().describe('RPC response type (always "multiinfo" for info)'),
  version: z.number().describe('RPC version'),
});
export type AurRpcInfoResponse = z.infer<typeof aurRpcInfoResponseSchema>;

export const aurRpcSearchResponseSchema = z.object({
  resultcount: z.number().describe('Number of results'),
  results: z.array(aurRpcPackageSchema).describe('Matching AUR packages'),
  type: z.string().describe('RPC response type'),
  version: z.number().describe('RPC version'),
});
export type AurRpcSearchResponse = z.infer<typeof aurRpcSearchResponseSchema>;

export const aurMaintainerInfoSchema = z.object({
  username: z.string().describe('AUR username'),
  packagesMaintained: z.number().describe('Number of packages maintained by this user'),
  totalVotes: z.number().describe('Total votes across all maintained packages'),
  registeredDate: z.string().describe("Submission date of the maintainer's oldest package (ISO 8601)"),
  novice: z.boolean().describe('Whether the account is flagged as novice'),
});
export type AurMaintainerInfo = z.infer<typeof aurMaintainerInfoSchema>;

export const aurMaintainerChangeSchema = z.object({
  previous: z.array(z.string()).describe('Previously known maintainers'),
  added: z.array(z.string()).describe('Newly added maintainers'),
  removed: z.array(z.string()).describe('Maintainers that were removed'),
  detectedAt: z.string().describe('ISO 8601 timestamp when the change was detected'),
});
export type AurMaintainerChange = z.infer<typeof aurMaintainerChangeSchema>;

export const aurPackageMetaSchema = z.object({
  votes: z.number().describe('Number of AUR votes'),
  popularity: z.number().describe('AUR popularity score'),
  firstSubmitted: z.string().describe('ISO 8601 date when the package was first submitted to AUR'),
  outOfDate: z.boolean().describe('Whether the package is out-of-date'),
  orphaned: z.boolean().describe('Whether the package is orphaned'),
});
export type AurPackageMeta = z.infer<typeof aurPackageMetaSchema>;

export const aurPackageScanSchema = z.object({
  packageName: z.string().describe('AUR package name'),
  packageBase: z.string().describe('AUR package base name'),
  status: z.enum(['scanning', 'awaiting-vt', 'done', 'failed']).describe('Current scan status'),
  error: z.string().optional().describe('Error message if the scan failed'),
  sources: z.array(z.string()).describe('PKGBUILD source URLs'),
  scannedFiles: z.array(z.string()).describe('List of scanned file paths'),
  findings: z.array(diffScanFindingSchema).describe('Static analysis findings from diff-scan rules'),
  pkgTypes: z
    .array(z.string())
    .optional()
    .describe('Package kinds from PKGBUILD heuristics, e.g. electron, nodejs, rust, python, compiled'),
  vtReports: z.array(vtIndicatorReportSchema).describe('VirusTotal indicator reports'),
  vtPending: z.number().describe('Number of pending VirusTotal lookups'),
  maintainers: z.array(aurMaintainerInfoSchema).describe('AUR maintainer information'),
  maintainerChange: aurMaintainerChangeSchema.optional().describe('Maintainer change detected during this scan'),
  packageMeta: aurPackageMetaSchema.describe('AUR package metadata'),
  /** All textual repository files shipped for review, PKGBUILD first. */
  sourceFiles: z.array(z.object({ name: z.string(), content: z.string() })).optional(),
  /** Repo files detected as binary (or oversized) and therefore not shipped. */
  skippedBinaryFiles: z.array(z.string()).optional(),
  startedAt: z.string().describe('ISO 8601 timestamp when the scan started'),
});
export type AurPackageScan = z.infer<typeof aurPackageScanSchema>;

export const aurScanStreamChunkSchema = z.object({
  scan: aurPackageScanSchema,
  complete: z.boolean(),
});
export type AurScanStreamChunk = z.infer<typeof aurScanStreamChunkSchema>;
