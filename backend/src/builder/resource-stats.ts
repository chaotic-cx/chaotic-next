import { BUILD_RESOURCE_SORT_FIELDS, type PackageResourceDayRow } from '@chaotic-next/shared-lib';

export type BuildResourceMetricKey = 'memory' | 'cpu' | 'disk' | 'network';

export const BUILD_RESOURCE_COLUMNS = {
  avgMemory: 'build."resourceStatsAvgMemoryBytes"',
  peakMemory: 'build."resourceStatsPeakMemoryBytes"',
  cpuTime: 'build."resourceStatsCpuTimeNs"',
  diskRead: 'build."resourceStatsDiskReadBytes"',
  diskWrite: 'build."resourceStatsDiskWriteBytes"',
  networkRx: 'build."resourceStatsNetworkRxBytes"',
  networkTx: 'build."resourceStatsNetworkTxBytes"',
  sampleCount: 'build."resourceStatsSampleCount"',
} as const;

export const DAY_ROW_KEYS: Record<
  'avgMemory' | 'peakMemory' | 'cpuTime' | 'diskIo' | 'networkIo',
  keyof PackageResourceDayRow
> = {
  avgMemory: 'avg_memory_bytes',
  peakMemory: 'peak_memory_bytes',
  cpuTime: 'cpu_time_ns',
  diskIo: 'disk_io_bytes',
  networkIo: 'network_io_bytes',
};

export const RESOURCE_METRIC_KEYS = [
  'memory',
  'cpu',
  'disk',
  'network',
] as const satisfies readonly BuildResourceMetricKey[];

export function isBuildResourceMetricKey(value: string): value is BuildResourceMetricKey {
  return (RESOURCE_METRIC_KEYS as readonly string[]).includes(value);
}

export function isBuildResourceSortField(value: string): boolean {
  return (BUILD_RESOURCE_SORT_FIELDS as readonly string[]).includes(value);
}

/**
 * Per-build heaviness of each metric; combined counters (disk/network) sum
 * both directions before averaging.
 */
export const HEAVY_RESOURCE_METRIC_EXPRESSIONS: Record<BuildResourceMetricKey, string> = {
  memory: `AVG(${BUILD_RESOURCE_COLUMNS.peakMemory})`,
  cpu: `AVG(${BUILD_RESOURCE_COLUMNS.cpuTime})`,
  disk: `AVG(${BUILD_RESOURCE_COLUMNS.diskRead} + ${BUILD_RESOURCE_COLUMNS.diskWrite})`,
  network: `AVG(${BUILD_RESOURCE_COLUMNS.networkRx} + ${BUILD_RESOURCE_COLUMNS.networkTx})`,
};
