export type ResourceMetricKey = 'memory' | 'cpu' | 'disk' | 'network';

export interface ResourceMetricDef {
  key: ResourceMetricKey;
  label: string;
  scale: number;
  unit: string;
}

const BYTES_PER_GIB = 1024 ** 3;
const BYTES_PER_MIB = 1024 ** 2;
const NANOSECONDS_PER_MINUTE = 60 * 1_000_000_000;

export const RESOURCE_METRICS: Record<ResourceMetricKey, ResourceMetricDef> = {
  memory: { key: 'memory', label: 'Memory', scale: 1 / BYTES_PER_GIB, unit: 'GiB' },
  cpu: { key: 'cpu', label: 'CPU time', scale: 1 / NANOSECONDS_PER_MINUTE, unit: 'min' },
  disk: { key: 'disk', label: 'Disk I/O', scale: 1 / BYTES_PER_GIB, unit: 'GiB' },
  network: { key: 'network', label: 'Network I/O', scale: 1 / BYTES_PER_MIB, unit: 'MiB' },
};

export const RESOURCE_METRIC_ORDER: ResourceMetricKey[] = ['memory', 'cpu', 'disk', 'network'];
