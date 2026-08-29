import { z } from 'zod';
import { packageSchema } from './package';

export enum BuildStatus {
  SUCCESS = 0,
  ALREADY_BUILT = 1,
  SKIPPED = 2,
  FAILED = 3,
  TIMED_OUT = 4,
  CANCELED = 5,
  CANCELED_REQUEUE = 6,
  SOFTWARE_FAILURE = 7,
}

export function isBuildStatus(value: number): value is BuildStatus {
  return Object.values(BuildStatus).includes(value);
}

export const STATUS_LABELS: Record<BuildStatus, string> = {
  [BuildStatus.SUCCESS]: 'success',
  [BuildStatus.ALREADY_BUILT]: 'already-built',
  [BuildStatus.SKIPPED]: 'skipped',
  [BuildStatus.FAILED]: 'failure',
  [BuildStatus.TIMED_OUT]: 'timeout',
  [BuildStatus.CANCELED]: 'canceled',
  [BuildStatus.CANCELED_REQUEUE]: 'canceled-requeue',
  [BuildStatus.SOFTWARE_FAILURE]: 'software-failure',
};

export const STATUS_DISPLAY_NAMES: Record<BuildStatus, string> = {
  [BuildStatus.SUCCESS]: 'Success',
  [BuildStatus.ALREADY_BUILT]: 'Already Built',
  [BuildStatus.SKIPPED]: 'Skipped',
  [BuildStatus.FAILED]: 'Failed',
  [BuildStatus.TIMED_OUT]: 'Timed Out',
  [BuildStatus.CANCELED]: 'Canceled',
  [BuildStatus.CANCELED_REQUEUE]: 'Canceled Requeue',
  [BuildStatus.SOFTWARE_FAILURE]: 'Software Failure',
};

export const BUILD_FAILURE_STATUSES: readonly BuildStatus[] = [
  BuildStatus.FAILED,
  BuildStatus.TIMED_OUT,
  BuildStatus.SOFTWARE_FAILURE,
];

export const BUILD_SUCCESS_STATUSES: readonly BuildStatus[] = [
  BuildStatus.SUCCESS,
  BuildStatus.ALREADY_BUILT,
  BuildStatus.SKIPPED,
];

export const BUILD_VERDICT_STATUSES: readonly BuildStatus[] = [...BUILD_SUCCESS_STATUSES, ...BUILD_FAILURE_STATUSES];

export const BUILD_RATE_LIMIT_FAILURE_STREAK = 5;
export const BUILD_RATE_LIMIT_RETRY_HOURS = 24;

export const BUILD_RESOURCE_SORT_FIELDS = ['peakMemory', 'cpuTime', 'diskIo', 'networkIo'] as const;
export type BuildResourceSortField = (typeof BUILD_RESOURCE_SORT_FIELDS)[number];

export const BUILD_SORT_FIELDS = [
  'id',
  'timestamp',
  'timeToEnd',
  'status',
  'pkgname',
  'builder',
  'repo',
  ...BUILD_RESOURCE_SORT_FIELDS,
] as const;
export type BuildSortField = (typeof BUILD_SORT_FIELDS)[number];

export function isBuildSortField(value: string): value is BuildSortField {
  return (BUILD_SORT_FIELDS as readonly string[]).includes(value);
}

export const buildResourceMetricsSchema = z.object({
  avgMemoryBytes: z.number().nullable().optional(),
  cpuTimeNs: z.number().nullable().optional(),
  diskReadBytes: z.number().nullable().optional(),
  diskWriteBytes: z.number().nullable().optional(),
  durationMs: z.number().nullable().optional(),
  networkRxBytes: z.number().nullable().optional(),
  networkTxBytes: z.number().nullable().optional(),
  peakMemoryBytes: z.number().nullable().optional(),
  peakPids: z.number().nullable().optional(),
  sampleCount: z.number().nullable().optional(),
});
export type BuildResourceMetrics = z.infer<typeof buildResourceMetricsSchema>;

export const builderSchema = z.object({
  id: z.number().describe('Record ID'),
  name: z.string().describe('Builder name'),
  description: z.string().optional().describe('Builder description'),
  builderClass: z.string().optional().describe('Assigned build class'),
  isActive: z.boolean().optional().describe('Whether the builder is active'),
  lastActive: z.coerce.date().optional().describe('Last activity (ISO 8601)'),
});
export type Builder = z.infer<typeof builderSchema>;

export enum RepoStatus {
  ACTIVE = 0,
  INACTIVE = 1,
  RUNNING = 2,
}

export const repoSchema = z.object({
  id: z.number().describe('Record ID'),
  name: z.string().describe('Repository name'),
  repoUrl: z.string().optional().describe('Repository URL'),
  isActive: z.boolean().describe('Whether the repository is active'),
  status: z.enum(RepoStatus).optional().describe('Repository status'),
  gitRef: z.string().describe('Git ref used for the repo checkout'),
  dbPath: z.string().optional().describe('Path of the repository database file'),
  apiToken: z.string().optional().describe('Encrypted GitLab API token'),
  gitlabProjectId: z.string().optional().describe('GitLab project ID'),
});
export type Repo = z.infer<typeof repoSchema>;

export const buildSchema = z.object({
  id: z.number().describe('Record ID'),
  pkgbase: packageSchema.describe('Package the build belongs to'),
  buildClass: z.string().optional().describe('Assigned build class'),
  builder: builderSchema.optional().describe('Builder that produced the build'),
  repo: repoSchema.optional().describe('Repository the build belongs to'),
  status: z.enum(BuildStatus).describe('Numeric build status'),
  statusText: z.string().describe('Human-readable status label'),
  timestamp: z.coerce.date().describe('When the build was queued (ISO 8601)'),
  arch: z.string().optional().describe('Target architecture'),
  logUrl: z.string().optional().describe('Build log URL'),
  commit: z.string().optional().describe('Commit hash built'),
  timeToEnd: z.number().optional().describe('Build duration'),
  replaced: z.boolean().optional().describe('Whether a newer build replaced this one'),
  failureTags: z
    .array(z.string())
    .optional()
    .describe('Failure cause tags detected in the build log; absent when none were recognized'),
  resourceStats: buildResourceMetricsSchema.nullable().optional().describe('Sampled container resource usage'),
});
export type Build = z.infer<typeof buildSchema>;

/**
 * Aggregated resource usage of a build container, sampled periodically while it ran. All byte and
 * time values are totals consumed over the whole container runtime, memory is aggregated across
 * samples since usage fluctuates constantly.
 */
export const buildResourceStatsSchema = z.object({
  /** Mean of all sampled memory usage values in bytes. */
  avg_memory_bytes: z.number(),
  /** Total CPU time consumed by the container in nanoseconds. */
  cpu_time_ns: z.number(),
  /** Total bytes read from block devices by the container. Zero if the engine reports no blkio data. */
  disk_read_bytes: z.number(),
  /** Total bytes written to block devices by the container. Zero if the engine reports no blkio data. */
  disk_write_bytes: z.number(),
  /** How long the build container was running. */
  duration_ms: z.number(),
  /** Total bytes received over all network interfaces during the build. */
  network_rx_bytes: z.number(),
  /** Total bytes sent over all network interfaces during the build. */
  network_tx_bytes: z.number(),
  /** Highest observed memory usage in bytes. */
  peak_memory_bytes: z.number(),
  /** Highest number of processes observed inside the container. */
  peak_pids: z.number(),
  /** How many samples the aggregation is based on; short builds may yield very few. */
  sample_count: z.number(),
});
export type BuildResourceStats = z.infer<typeof buildResourceStatsSchema>;

export const packageResourceDayRowSchema = z.object({
  day: z.string().describe('Day (YYYY-MM-DD)'),
  avg_memory_bytes: z.string().describe('Average sampled memory usage per build (bytes)'),
  peak_memory_bytes: z.string().describe('Highest peak memory usage of a single build that day (bytes)'),
  cpu_time_ns: z.string().describe('Average CPU time consumed per build (nanoseconds)'),
  disk_io_bytes: z.string().describe('Average bytes read from and written to block devices per build'),
  network_io_bytes: z.string().describe('Average bytes received and sent over the network per build'),
  samples: z.string().describe('Number of sampled builds that day'),
});
export type PackageResourceDayRow = z.infer<typeof packageResourceDayRowSchema>;

export const unresolvedFailedBuildSchema = z.object({
  pkgname: z.string().describe('Package name'),
  status: z.enum(BuildStatus).describe('Numeric build status of the latest failing build'),
  statusText: z.string().describe('Human-readable status label'),
  timestamp: z.string().describe('When the latest failing build happened (ISO 8601)'),
  streakStartedAt: z.string().describe('When the current failure streak started (ISO 8601)'),
  logUrl: z.string().nullable().describe('Build log URL, when present'),
  consecutiveFailures: z.number().describe('Failing builds since the last resolving one'),
  silenced: z.boolean().describe('Whether the failure is silenced until its next failure'),
});
export type UnresolvedFailedBuild = z.infer<typeof unresolvedFailedBuildSchema>;

export const shouldBuildDecisionSchema = z.object({
  shouldBuild: z.boolean().describe('Whether dispatching a build is likely to succeed'),
  consecutiveFailures: z.number().describe('Consecutive failures behind the decision'),
});
export type ShouldBuildDecision = z.infer<typeof shouldBuildDecisionSchema>;
