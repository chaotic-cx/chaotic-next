import { marker } from '@jsverse/transloco-keys-manager/marker';

export type ResourceMetricKey = 'memory' | 'cpu' | 'disk' | 'network';

export interface ResourceMetricDef {
  key: ResourceMetricKey;
  labelKey: string;
  scale: number;
  unit: string;
}

const BYTES_PER_GIB = 1024 ** 3;
const BYTES_PER_MIB = 1024 ** 2;
const NANOSECONDS_PER_MINUTE = 60 * 1_000_000_000;

export const RESOURCE_METRICS: Record<ResourceMetricKey, ResourceMetricDef> = {
  memory: { key: 'memory', labelKey: marker('stats.resourceMetrics.memory'), scale: 1 / BYTES_PER_GIB, unit: 'GiB' },
  cpu: { key: 'cpu', labelKey: marker('stats.resourceMetrics.cpu'), scale: 1 / NANOSECONDS_PER_MINUTE, unit: 'min' },
  disk: { key: 'disk', labelKey: marker('stats.resourceMetrics.disk'), scale: 1 / BYTES_PER_GIB, unit: 'GiB' },
  network: { key: 'network', labelKey: marker('stats.resourceMetrics.network'), scale: 1 / BYTES_PER_MIB, unit: 'MiB' },
};

export const RESOURCE_METRIC_ORDER: ResourceMetricKey[] = ['memory', 'cpu', 'disk', 'network'];
