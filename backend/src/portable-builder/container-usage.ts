import type { BuildResourceStats } from '@chaotic-next/shared-lib';
import type { ContainerStats } from 'dockerode';

/**
 * A single sampled snapshot of the resource usage of a container. Mirrors the
 * ContainerUsage shape of chaotic-manager so the watchdog algorithm behaves identically.
 */
export interface ContainerUsage {
  /** Total CPU time consumed by the container in nanoseconds. */
  cpu_accumulated_ns: number;
  /** Current memory usage of the container in bytes. */
  memory_bytes: number;
  /** Total bytes received over all network interfaces since the container was started. */
  network_rx_bytes: number;
  /** Total bytes sent over all network interfaces since the container was started. */
  network_tx_bytes: number;
  /** Total bytes read from block devices since the container was started. Zero if unavailable. */
  disk_read_bytes: number;
  /** Total bytes written to block devices since the container was started. Zero if unavailable. */
  disk_write_bytes: number;
  /** Number of processes currently running inside the container. Zero if unavailable. */
  pids_current: number;
}

/**
 * Minimum change of a resource counter between two samples for it to count as activity. CPU time
 * is exempt from this: it only accumulates while the container's own processes run, so even the
 * smallest increase is meaningful.
 */
export interface ContainerActivityThresholds {
  network_bytes: number;
  memory_bytes: number;
}

export const DEFAULT_ACTIVITY_THRESHOLDS: ContainerActivityThresholds = {
  memory_bytes: 1024 * 1024,
  network_bytes: 64 * 1024,
};

export function hasUsageChanged(
  previous: ContainerUsage,
  current: ContainerUsage,
  thresholds: ContainerActivityThresholds = DEFAULT_ACTIVITY_THRESHOLDS,
): boolean {
  return (
    current.cpu_accumulated_ns > previous.cpu_accumulated_ns ||
    current.memory_bytes - previous.memory_bytes >= thresholds.memory_bytes ||
    current.network_rx_bytes - previous.network_rx_bytes >= thresholds.network_bytes ||
    current.network_tx_bytes - previous.network_tx_bytes >= thresholds.network_bytes
  );
}

export function formatContainerUsage(usage: ContainerUsage): string {
  return (
    `cpu=${(usage.cpu_accumulated_ns / 1e9).toFixed(2)}s, ` +
    `mem=${(usage.memory_bytes / 1024 ** 2).toFixed(1)}MiB, ` +
    `rx=${(usage.network_rx_bytes / 1024 ** 2).toFixed(1)}MiB, ` +
    `tx=${(usage.network_tx_bytes / 1024 ** 2).toFixed(1)}MiB, ` +
    `disk=${(usage.disk_read_bytes / 1024 ** 2).toFixed(1)}/${(usage.disk_write_bytes / 1024 ** 2).toFixed(1)}MiB, ` +
    `pids=${usage.pids_current}`
  );
}

export function usageFromStats(stats: ContainerStats): ContainerUsage {
  return {
    cpu_accumulated_ns: stats.cpu_stats?.cpu_usage?.total_usage ?? 0,
    memory_bytes: calculateMemoryUsage(stats.memory_stats),
    network_rx_bytes: sumNetworkBytes(stats.networks, 'rx_bytes'),
    network_tx_bytes: sumNetworkBytes(stats.networks, 'tx_bytes'),
    disk_read_bytes: sumBlkioBytes(stats.blkio_stats, 'read'),
    disk_write_bytes: sumBlkioBytes(stats.blkio_stats, 'write'),
    pids_current: stats.pids_stats?.current ?? 0,
  };
}

function calculateMemoryUsage(memoryStats: ContainerStats['memory_stats']): number {
  if (!memoryStats || !memoryStats.usage) return 0;
  const stats = memoryStats.stats as Record<string, number> | undefined;
  const inactiveFile = stats?.inactive_file ?? stats?.total_inactive_file ?? 0;
  return Math.max(0, memoryStats.usage - inactiveFile);
}

function sumNetworkBytes(networks: ContainerStats['networks'], field: 'rx_bytes' | 'tx_bytes'): number {
  if (!networks) return 0;
  return Object.values(networks).reduce((total, interfaceStats) => total + (interfaceStats[field] ?? 0), 0);
}

function sumBlkioBytes(blkioStats: ContainerStats['blkio_stats'], op: 'read' | 'write'): number {
  return (
    blkioStats?.io_service_bytes_recursive?.reduce(
      (total, entry) => (entry.op?.toLowerCase() === op ? total + (entry.value ?? 0) : total),
      0,
    ) ?? 0
  );
}

/**
 * Aggregates periodically sampled container usage snapshots into per-build totals. Cumulative
 * counters (CPU time, network and disk traffic) are taken from the last sample, while memory usage
 * and pids are aggregated as peak values since they fluctuate constantly.
 */
export class ContainerStatsCollector {
  private memorySumBytes = 0;
  private sampleCount = 0;
  private peakMemoryBytes = 0;
  private peakPids = 0;
  private lastSample: ContainerUsage | null = null;

  addSample(usage: ContainerUsage): void {
    this.lastSample = usage;
    this.sampleCount++;
    this.memorySumBytes += usage.memory_bytes;
    this.peakMemoryBytes = Math.max(this.peakMemoryBytes, usage.memory_bytes);
    this.peakPids = Math.max(this.peakPids, usage.pids_current);
  }

  /**
   * Returns the aggregated resource usage over all samples fed so far, or null when no sample was
   * collected yet (e.g. builds that finished before the first sampling interval elapsed).
   */
  getStats(durationMs: number): BuildResourceStats | null {
    if (!this.lastSample || this.sampleCount === 0) return null;
    return {
      avg_memory_bytes: Math.round(this.memorySumBytes / this.sampleCount),
      cpu_time_ns: this.lastSample.cpu_accumulated_ns,
      disk_read_bytes: this.lastSample.disk_read_bytes,
      disk_write_bytes: this.lastSample.disk_write_bytes,
      duration_ms: Math.round(durationMs),
      network_rx_bytes: this.lastSample.network_rx_bytes,
      network_tx_bytes: this.lastSample.network_tx_bytes,
      peak_memory_bytes: this.peakMemoryBytes,
      peak_pids: this.peakPids,
      sample_count: this.sampleCount,
    };
  }
}

export function resourceStatsToUsage(stats: BuildResourceStats): ContainerUsage {
  return {
    cpu_accumulated_ns: stats.cpu_time_ns,
    memory_bytes: stats.peak_memory_bytes,
    network_rx_bytes: stats.network_rx_bytes,
    network_tx_bytes: stats.network_tx_bytes,
    disk_read_bytes: stats.disk_read_bytes,
    disk_write_bytes: stats.disk_write_bytes,
    pids_current: stats.peak_pids,
  };
}
