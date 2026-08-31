import { describe, expect, it } from 'vitest';
import type { ContainerStats } from 'dockerode';
import {
  ContainerStatsCollector,
  DEFAULT_ACTIVITY_THRESHOLDS,
  hasUsageChanged,
  resourceStatsToUsage,
  usageFromStats,
  type ContainerUsage,
} from './container-usage';

function usage(overrides: Partial<ContainerUsage> = {}): ContainerUsage {
  return {
    cpu_accumulated_ns: 1_000_000,
    memory_bytes: 100 * 1024 * 1024,
    network_rx_bytes: 1024,
    network_tx_bytes: 1024,
    disk_read_bytes: 0,
    disk_write_bytes: 0,
    pids_current: 5,
    ...overrides,
  };
}

describe('hasUsageChanged', () => {
  it('counts any CPU time increase as activity', () => {
    expect(hasUsageChanged(usage(), usage({ cpu_accumulated_ns: 1_000_001 }))).toBe(true);
  });

  it('requires the memory threshold to be reached', () => {
    const below = usage({ memory_bytes: 100 * 1024 * 1024 + DEFAULT_ACTIVITY_THRESHOLDS.memory_bytes - 1 });
    const above = usage({ memory_bytes: 100 * 1024 * 1024 + DEFAULT_ACTIVITY_THRESHOLDS.memory_bytes });
    expect(hasUsageChanged(usage(), below)).toBe(false);
    expect(hasUsageChanged(usage(), above)).toBe(true);
  });

  it('requires the network threshold to be reached', () => {
    const below = usage({ network_tx_bytes: 1024 + DEFAULT_ACTIVITY_THRESHOLDS.network_bytes - 1 });
    const above = usage({ network_rx_bytes: 1024 + DEFAULT_ACTIVITY_THRESHOLDS.network_bytes });
    expect(hasUsageChanged(usage(), below)).toBe(false);
    expect(hasUsageChanged(usage(), above)).toBe(true);
  });

  it('reports no change for identical usage', () => {
    expect(hasUsageChanged(usage(), usage())).toBe(false);
  });
});

describe('usageFromStats', () => {
  it('maps a raw docker stats response', () => {
    const stats = {
      cpu_stats: { cpu_usage: { total_usage: 123456789 } },
      memory_stats: { usage: 300 * 1024 * 1024, stats: { inactive_file: 50 * 1024 * 1024 } },
      networks: { eth0: { rx_bytes: 100, tx_bytes: 200 }, lo: { rx_bytes: 10, tx_bytes: 20 } },
      blkio_stats: {
        io_service_bytes_recursive: [
          { op: 'Read', value: 300 },
          { op: 'write', value: 400 },
        ],
      },
      pids_stats: { current: 42 },
    } as unknown as ContainerStats;

    expect(usageFromStats(stats)).toEqual({
      cpu_accumulated_ns: 123456789,
      memory_bytes: 250 * 1024 * 1024,
      network_rx_bytes: 110,
      network_tx_bytes: 220,
      disk_read_bytes: 300,
      disk_write_bytes: 400,
      pids_current: 42,
    });
  });

  it('clamps memory to zero and tolerates missing sections', () => {
    const stats = {
      memory_stats: { usage: 100, stats: { total_inactive_file: 200 } },
    } as unknown as ContainerStats;

    expect(usageFromStats(stats)).toEqual({
      cpu_accumulated_ns: 0,
      memory_bytes: 0,
      network_rx_bytes: 0,
      network_tx_bytes: 0,
      disk_read_bytes: 0,
      disk_write_bytes: 0,
      pids_current: 0,
    });
  });
});

describe('ContainerStatsCollector', () => {
  it('returns null before the first sample', () => {
    expect(new ContainerStatsCollector().getStats(1000)).toBeNull();
  });

  it('aggregates peaks, averages, and final cumulative counters', () => {
    const collector = new ContainerStatsCollector();
    collector.addSample(usage({ memory_bytes: 200 * 1024 * 1024, pids_current: 10 }));
    collector.addSample(usage({ memory_bytes: 400 * 1024 * 1024, pids_current: 3, cpu_accumulated_ns: 5_000_000 }));

    expect(collector.getStats(1500.4)).toEqual({
      avg_memory_bytes: 300 * 1024 * 1024,
      cpu_time_ns: 5_000_000,
      disk_read_bytes: 0,
      disk_write_bytes: 0,
      duration_ms: 1500,
      network_rx_bytes: 1024,
      network_tx_bytes: 1024,
      peak_memory_bytes: 400 * 1024 * 1024,
      peak_pids: 10,
      sample_count: 2,
    });
  });
});

describe('resourceStatsToUsage', () => {
  it('maps stored stats back to a usage snapshot', () => {
    const stats = {
      avg_memory_bytes: 1,
      cpu_time_ns: 2,
      disk_read_bytes: 3,
      disk_write_bytes: 4,
      duration_ms: 5,
      network_rx_bytes: 6,
      network_tx_bytes: 7,
      peak_memory_bytes: 8,
      peak_pids: 9,
      sample_count: 10,
    };
    expect(resourceStatsToUsage(stats)).toEqual({
      cpu_accumulated_ns: 2,
      memory_bytes: 8,
      network_rx_bytes: 6,
      network_tx_bytes: 7,
      disk_read_bytes: 3,
      disk_write_bytes: 4,
      pids_current: 9,
    });
  });
});
