import { z } from 'zod';
import {
  aurMaintainerChangeSchema as aurMaintainerChangeLink,
  aurMaintainerInfoSchema as aurMaintainerInfoLink,
  diffScanFindingSchema as diffScanFindingLink,
  vtIndicatorReportSchema as vtIndicatorReportLink,
} from '../types/aur';
import { BUILD_CLASS_MAX, BUILD_CLASS_MIN } from '../types/core';
import { externalCommitStatusSchema as externalCommitStatusLink } from '../types/gitlab';

/**
 * One-field building blocks shared by the aggregate row schemas below. They
 * exist to keep descriptions consistent; compose them with .extend() or .merge
 * semantics via z.object spread.
 */
const day = z.string().describe('Day (YYYY-MM-DD)');
const pkgbase = z.string().describe('Package base name');
const pkgname = z.string().describe('Package name');
const builderName = z.string().describe('Builder name');
const repo = z.string().describe('Repository name');
const buildCount = z.string().describe('Number of builds');
const failedCount = z.string().describe('Number of failed builds');
const downloadCount = z.string().describe('Number of downloads');
const hitCount = z.string().describe('Number of hits');
const average = z.string().describe('Average build time (seconds)');
const status = z.string().describe('Build status');

// ---- Builder aggregate rows ----

export const buildWithUrlSchema = z.object({
  commit: z.string().describe('Commit hash'),
  logUrl: z.string().describe('Build log URL'),
  pkgname: z.string().describe('Package name'),
  timeToEnd: z.string().describe('Time to end (human-readable)'),
  version: z.string().describe('Package version'),
});
export type BuildWithUrl = z.infer<typeof buildWithUrlSchema>;

export const pkgCountSchema = z.object({ pkgbase, count: buildCount });
export type PkgCount = z.infer<typeof pkgCountSchema>;

export const builderCountSchema = z.object({ name: builderName, count: buildCount });
export type BuilderCount = z.infer<typeof builderCountSchema>;

export const dayRepoCountSchema = z.object({ day, repo, count: buildCount });
export type DayRepoCount = z.infer<typeof dayRepoCountSchema>;

export const dayAverageSchema = z.object({ day, average });
export type DayAverage = z.infer<typeof dayAverageSchema>;

export const popularPackageSchema = z.object({
  pkgbase_pkgname: z.string().describe('Package base and name'),
  count: buildCount,
});
export type PopularPackage = z.infer<typeof popularPackageSchema>;

export const dayCountSchema = z.object({ day, count: buildCount });
export type DayCount = z.infer<typeof dayCountSchema>;

export const dayStatusAverageSchema = z.object({ day, average, status });
export type DayStatusAverage = z.infer<typeof dayStatusAverageSchema>;

export const failedBuildHotspotSchema = z.object({ pkgname, count: failedCount });
export type FailedBuildHotspot = z.infer<typeof failedBuildHotspotSchema>;

export const failedBuildOverTimeSchema = z.object({ day, pkgname, count: failedCount });
export type FailedBuildOverTime = z.infer<typeof failedBuildOverTimeSchema>;

export const heavyPackageSchema = z.object({ pkgname, average });
export type HeavyPackage = z.infer<typeof heavyPackageSchema>;

export const averageBuildTimeSchema = z.object({
  average_build_time: z.string().describe('Average build time (seconds)'),
  status,
});
export type AverageBuildTime = z.infer<typeof averageBuildTimeSchema>;

export const averagePackageBuildTimeSchema = z.object({
  pkgname,
  average_build_time: z.string().describe('Average build time (seconds)'),
  samples: z.string().describe('Number of samples'),
});
export type AveragePackageBuildTime = z.infer<typeof averagePackageBuildTimeSchema>;

export const throughputDaySchema = z.object({
  day,
  success: z.string().describe('Successful builds'),
  alreadyBuilt: z.string().describe('Already-built (skipped)'),
  skipped: z.string().describe('Skipped builds'),
  failed: z.string().describe('Failed builds'),
});
export type ThroughputDay = z.infer<typeof throughputDaySchema>;

// ---- Router aggregate rows ----

export const countryStatsSchema = z.object({
  country: z.string().describe('Country of the router hit'),
  count: hitCount,
});
export type CountryStats = z.infer<typeof countryStatsSchema>;

export const mirrorStatsSchema = z.object({ mirror: z.string().describe('Mirror hostname'), count: hitCount });
export type MirrorStats = z.infer<typeof mirrorStatsSchema>;

export const packageStatsSchema = z.object({ pkgbase, count: hitCount });
export type PackageStats = z.infer<typeof packageStatsSchema>;

export const perDayStatsSchema = z.object({ day, count: hitCount });
export type PerDayStats = z.infer<typeof perDayStatsSchema>;

export const mirrorOverTimeSchema = z.object({
  day,
  mirror: z.string().describe('Mirror hostname'),
  count: downloadCount,
});
export type MirrorOverTime = z.infer<typeof mirrorOverTimeSchema>;

export const countryOverTimeSchema = z.object({
  day,
  country: z.string().describe('Country code'),
  count: downloadCount,
});
export type CountryOverTime = z.infer<typeof countryOverTimeSchema>;

export const userAgentTrendSchema = z.object({
  day,
  userAgent: z.string().describe('User agent string'),
  count: downloadCount,
});
export type UserAgentTrend = z.infer<typeof userAgentTrendSchema>;

// ---- Health ----

export const healthCheckResultSchema = z.object({
  status: z.enum(['ok', 'error']).describe('Overall health status'),
  info: z
    .record(z.string(), z.object({ status: z.enum(['up', 'down']) }))
    .describe('Information from healthy indicators'),
  error: z
    .record(z.string(), z.object({ status: z.enum(['up', 'down']), message: z.string().optional() }))
    .describe('Errors from unhealthy indicators'),
  details: z
    .record(z.string(), z.object({ status: z.enum(['up', 'down']), message: z.string().optional() }))
    .describe('Details from all health indicators'),
});

// ---- Pagination ----

/** Wraps an item schema in the API's standard paginated envelope. */
export function paginatedSchema(item: z.ZodObject): z.ZodObject {
  return z.object({
    items: z.array(item).describe('Page of entries'),
    total: z.number().describe('Total number of entries across all pages'),
    page: z.number().describe('Current 1-based page number'),
    perPage: z.number().describe('Entries per page'),
    totalPages: z.number().describe('Total number of pages'),
  });
}

// ---- Admin / repo-manager ----

export const adjustBuildClassResponseSchema = z.object({
  pkgname: z.string().describe('Name of the adjusted package'),
  pkgbase: z.string().describe('Pkgbase whose .CI/config was inspected'),
  buildClass: z
    .number()
    .int()
    .min(BUILD_CLASS_MIN)
    .max(BUILD_CLASS_MAX)
    .describe('Effective build class after the adjustment'),
  adjusted: z.boolean().describe('True when the .CI/config was changed'),
});
export type AdjustBuildClassResponse = z.infer<typeof adjustBuildClassResponseSchema>;

export const rescanStartedSchema = z.object({
  started: z.number().describe('Number of packages queued for background rescanning'),
  jobId: z.string().describe('Poll GET /admin/rescan/{jobId} for the job outcome'),
});

export const bumpPackagesResultSchema = z.object({
  bumped: z.array(z.string()).describe('Package names that were actually bumped and committed'),
});
export type BumpPackagesResult = z.infer<typeof bumpPackagesResultSchema>;

// ---- Build insights ----

export const flakyPackageSchema = z.object({
  pkgname,
  attempts: z.number().describe('Genuine build attempts inside the window'),
  failures: z.number().describe('Failed builds inside the window'),
  flakiness: z.number().describe('Failure rate from 0 to 1'),
});

export const builderUtilizationSchema = z.object({
  builder: builderName,
  hour: z.number().describe('UTC hour of day (0-23)'),
  count: z.number().describe('Builds inside the window for this builder and hour bucket'),
});

// ---- GitLab ----

export const approveMrResponseSchema = z.object({
  deferred: z
    .boolean()
    .describe('Whether the merge request was merged directly or deferred until after scheduled pipeline'),
});
export type ApproveMrResponse = z.infer<typeof approveMrResponseSchema>;

export const pipelineSchema = z.object({
  id: z.number().describe('GitLab pipeline ID'),
  iid: z.number().describe('Pipeline internal ID'),
  project_id: z.number().describe('GitLab project ID'),
  sha: z.string().describe('Pipeline commit SHA'),
  ref: z.string().describe('Git ref the pipeline runs on'),
  status: z.string().describe('Pipeline status (pending, running, success, failed, etc.)'),
  web_url: z.string().describe('URL to the pipeline page in GitLab'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  updated_at: z.string().describe('ISO 8601 last-updated timestamp'),
});

export const pipelineWithExternalStatusSchema = z.object({
  commit: z.array(externalCommitStatusLink).describe('External commit status checks'),
  pipeline: pipelineSchema.describe('GitLab pipeline information'),
});

export const mergeRequestDiffSchema = z.object({
  old_path: z.string().describe('Original file path'),
  new_path: z.string().describe('New file path'),
  a_mode: z.string().describe('File mode of the old version'),
  b_mode: z.string().describe('File mode of the new version'),
  new_file: z.boolean().describe('Whether this is a new file'),
  renamed_file: z.boolean().describe('Whether the file was renamed'),
  deleted_file: z.boolean().describe('Whether the file was deleted'),
  diff: z.string().describe('Unified diff content'),
});

export const simpleUserSchema = z.object({
  id: z.number().describe('GitLab user ID'),
  username: z.string().describe('GitLab username'),
  name: z.string().describe('Display name'),
  avatar_url: z.string().describe('Avatar image URL'),
  web_url: z.string().describe('Profile page URL'),
  state: z.string().describe('Account state (active, blocked, etc.)'),
});

export const mergeRequestWithDiffsSchema = z.object({
  id: z.number().describe('GitLab merge request ID'),
  iid: z.number().describe('Merge request internal ID within the project'),
  title: z.string().describe('Merge request title'),
  state: z.string().describe('Merge request state (opened, closed, merged)'),
  web_url: z.string().describe('URL to the merge request in GitLab'),
  created_at: z.string().describe('ISO 8601 creation timestamp'),
  updated_at: z.string().describe('ISO 8601 last-updated timestamp'),
  assignees: z.array(simpleUserSchema).nullable().describe('Assigned users'),
  sha: z.string().describe('HEAD commit SHA'),
  merge_status: z.string().describe('Overall merge status'),
  detailed_merge_status: z.string().describe('Detailed merge status'),
  diffs: z.array(mergeRequestDiffSchema).describe('File diffs in this merge request'),
  labels: z.array(z.string()).describe('MR labels'),
  scanFindings: z.array(diffScanFindingLink).optional().describe('Static analysis findings from the diff scan'),
  vtReports: z.array(vtIndicatorReportLink).optional().describe('VirusTotal indicator reports'),
  maintainers: z.array(aurMaintainerInfoLink).optional().describe('AUR maintainer information'),
  maintainerChange: aurMaintainerChangeLink.optional().describe('Maintainer change detected during scan'),
  packageInfo: z.record(z.string(), z.unknown()).optional().describe('Package metadata extracted from PKGBUILD'),
  diff_refs: z
    .object({ base_sha: z.string(), head_sha: z.string(), start_sha: z.string() })
    .nullable()
    .optional()
    .describe('Diff reference SHAs for base, head, and start'),
});

export const reviewStatsSchema = z.object({
  username: z.string().describe('GitLab username'),
  reviews: z.number().describe('Number of merge request reviews'),
});

export const reviewStatsOverTimeSchema = z.object({
  date: z.string().describe('Date (YYYY-MM-DD)'),
  username: z.string().describe('GitLab username'),
  reviews: z.number().describe('Number of reviews on this date'),
});

const dependencyNodeSchema = z.object({
  pkgType: z.enum(['0', '1']).describe('Package type'),
  pkgId: z.number().describe('Package ID'),
  pkgname: z.string().describe('Package name'),
  providedSonames: z.array(z.string()).describe('Sonames this package provides'),
  neededSonames: z.array(z.string()).describe('Sonames this package links against'),
});

export const dependencyEdgeSchema = z.object({
  consumer: dependencyNodeSchema.describe('The consuming package (links the soname)'),
  provider: dependencyNodeSchema.describe('The providing package (ships the soname)'),
  soname: z.string().describe('Shared object name linking consumer to provider'),
});

export const packagesPerBuildClassSchema = z.object({
  build_class: z.string().describe('Build class'),
  count: buildCount,
});
export type PackagesPerBuildClass = z.infer<typeof packagesPerBuildClassSchema>;

export const pkgbaseCompositionSchema = z.object({
  type: z.string().describe("Either 'single' or 'split'"),
  count: z.string().describe('Number of active packages in this group'),
});
export type PkgbaseComposition = z.infer<typeof pkgbaseCompositionSchema>;
