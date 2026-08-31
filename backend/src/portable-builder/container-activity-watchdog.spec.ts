import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContainerActivityWatchdog } from './container-activity-watchdog';
import type { ContainerUsage } from './container-usage';

const USAGE: ContainerUsage = {
  cpu_accumulated_ns: 100,
  memory_bytes: 1000,
  network_rx_bytes: 0,
  network_tx_bytes: 0,
  disk_read_bytes: 0,
  disk_write_bytes: 0,
  pids_current: 1,
};

interface WatchdogHarness {
  samples: ContainerUsage[];
  timeouts: ContainerUsage[];
  watchdog: ContainerActivityWatchdog;
}

function usage(overrides: Partial<ContainerUsage> = {}): ContainerUsage {
  return { ...USAGE, ...overrides };
}

function startWatchdog(
  usageProvider: () => Promise<ContainerUsage | null>,
  idleTimeoutMs: number,
  pollIntervalMs = 100,
): WatchdogHarness {
  const samples: ContainerUsage[] = [];
  const timeouts: ContainerUsage[] = [];
  const watchdog = new ContainerActivityWatchdog({
    getUsage: usageProvider,
    idleTimeoutMs,
    pollIntervalMs,
    onSample: (usage) => samples.push(usage),
    onTimeout: (usage) => timeouts.push(usage),
  });
  watchdog.start();
  return { samples, timeouts, watchdog };
}

describe('ContainerActivityWatchdog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not time out while usage keeps changing', async () => {
    let cpu = USAGE.cpu_accumulated_ns;
    const harness = startWatchdog(async () => usage({ cpu_accumulated_ns: ++cpu }), 1000);

    for (let i = 0; i < 15; i++) await vi.advanceTimersByTimeAsync(100);

    expect(harness.timeouts).toHaveLength(0);
    expect(harness.samples.length).toBeGreaterThanOrEqual(15);
    harness.watchdog.stop();
  });

  it('fires onTimeout once after the idle timeout of unchanged usage', async () => {
    const harness = startWatchdog(async () => USAGE, 1000);

    await vi.advanceTimersByTimeAsync(1100);

    expect(harness.timeouts).toEqual([USAGE]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(harness.timeouts).toHaveLength(1);
  });

  it('resets the idle clock when activity resumes', async () => {
    let idleTicks = 0;
    let bumped = false;
    const harness = startWatchdog(async () => {
      idleTicks++;
      if (idleTicks === 6 && !bumped) {
        bumped = true;
        return usage({ cpu_accumulated_ns: USAGE.cpu_accumulated_ns + 1 });
      }
      return USAGE;
    }, 1000);

    await vi.advanceTimersByTimeAsync(600);
    expect(harness.timeouts).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(harness.timeouts).toHaveLength(1);
    harness.watchdog.stop();
  });

  it('never times out when idle detection is disabled', async () => {
    const harness = startWatchdog(async () => USAGE, Number.POSITIVE_INFINITY);

    for (let i = 0; i < 20; i++) await vi.advanceTimersByTimeAsync(100);

    expect(harness.timeouts).toHaveLength(0);
    harness.watchdog.stop();
  });

  it('ignores failed samples instead of killing the build', async () => {
    const harness = startWatchdog(async () => null, 1000);

    await vi.advanceTimersByTimeAsync(1500);

    expect(harness.timeouts).toHaveLength(0);
    expect(harness.samples).toHaveLength(0);
    harness.watchdog.stop();
  });
});
