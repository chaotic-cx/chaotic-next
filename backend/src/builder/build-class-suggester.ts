import {
  BUILD_CLASS_MAX,
  BUILD_CLASS_MIN,
  snapBuildClassToEven,
  type BuildResourceAverages,
} from '@chaotic-next/shared-lib';

const BYTES_PER_MIB = 1024 ** 2;
const BYTES_PER_GIB = 1024 ** 3;
const NS_PER_SECOND = 1e9;
const SECONDS_PER_HOUR = 3600;
export const SECONDS_PER_MINUTE = 60;

interface MetricScale {
  /** Usage at or below this level scores 0. */
  readonly floor: number;
  /** Usage at or above this level scores BUILD_CLASS_MAX. */
  readonly ceiling: number;
  /** Share of the final score; weights of available metrics are re-normalized. */
  readonly weight: number;
}

/**
 * Per-metric scoring ranges on a logarithmic scale, chosen so that typical
 * Chaotic-AUR builds spread evenly across the classes:
 * - memory: 256 MiB (small CLI tools) → 32 GiB (chromium/rust/telegram builds)
 * - cpu: total CPU time 1 min → 4 h wall-clock-equivalent multi-core burn
 * - disk: read+written bytes 128 MiB → 64 GiB
 * - duration: wall-clock build time 2 min → 2 h
 */
const METRIC_SCALES: Record<keyof BuildResourceAverages, MetricScale> = {
  avgPeakMemoryBytes: { floor: 256 * BYTES_PER_MIB, ceiling: 32 * BYTES_PER_GIB, weight: 0.4 },
  avgCpuTimeNs: { floor: 60 * NS_PER_SECOND, ceiling: 4 * SECONDS_PER_HOUR * NS_PER_SECOND, weight: 0.3 },
  avgDiskIoBytes: { floor: 128 * BYTES_PER_MIB, ceiling: 64 * BYTES_PER_GIB, weight: 0.2 },
  avgDurationSeconds: { floor: 2 * SECONDS_PER_MINUTE, ceiling: 2 * SECONDS_PER_HOUR, weight: 0.1 },
};

function isUsableSample(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function logScaleScore(value: number, scale: MetricScale): number {
  if (value <= scale.floor) return BUILD_CLASS_MIN;
  if (value >= scale.ceiling) return BUILD_CLASS_MAX;
  const progress = Math.log(value / scale.floor) / Math.log(scale.ceiling / scale.floor);
  return progress * BUILD_CLASS_MAX;
}

/**
 * Maps averaged resource usage of a package to a suggested numeric build class.
 * Each metric is scored independently on a log scale and combined by weighted
 * average; metrics without data are skipped and their weight redistributed.
 * Returns null when nothing was sampled. Suggestions are even-only; odd
 * classes are reserved for manual configuration.
 */
export function suggestBuildClass(averages: BuildResourceAverages): number | null {
  let weightedScore = 0;
  let totalWeight = 0;
  for (const [metric, scale] of Object.entries(METRIC_SCALES)) {
    const value = averages[metric as keyof BuildResourceAverages];
    if (!isUsableSample(value)) continue;
    weightedScore += logScaleScore(value, scale) * scale.weight;
    totalWeight += scale.weight;
  }
  if (totalWeight === 0) return null;
  return snapBuildClassToEven(weightedScore / totalWeight);
}
