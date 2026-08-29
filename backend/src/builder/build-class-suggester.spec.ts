import { describe, expect, it } from 'vitest';
import { BUILD_CLASS_MAX, BUILD_CLASS_MIN } from '@chaotic-next/shared-lib';
import { suggestBuildClass } from './build-class-suggester';

const BYTES_PER_MIB = 1024 ** 2;
const BYTES_PER_GIB = 1024 ** 3;
const NS_PER_SECOND = 1e9;

describe('suggestBuildClass', () => {
  it('returns null when no metric was sampled', () => {
    expect(suggestBuildClass({})).toBeNull();
    expect(suggestBuildClass({ avgPeakMemoryBytes: null, avgCpuTimeNs: undefined, avgDiskIoBytes: null })).toBeNull();
    expect(suggestBuildClass({ avgPeakMemoryBytes: Number.NaN })).toBeNull();
  });

  it('returns the minimum class for a trivial package', () => {
    const nicotinePlusGit = {
      avgPeakMemoryBytes: 194 * BYTES_PER_MIB,
      avgCpuTimeNs: 26 * NS_PER_SECOND,
      avgDiskIoBytes: 987 * BYTES_PER_MIB,
      avgDurationSeconds: 81,
    };
    expect(suggestBuildClass(nicotinePlusGit)).toBeLessThanOrEqual(2);
  });

  it('returns a very heavy class for a huge package', () => {
    const ayugramDesktopGit = {
      avgPeakMemoryBytes: 26 * BYTES_PER_GIB,
      avgCpuTimeNs: 23123 * NS_PER_SECOND,
      avgDiskIoBytes: 8.7 * BYTES_PER_GIB,
      avgDurationSeconds: 1676,
    };
    expect(suggestBuildClass(ayugramDesktopGit)).toBeGreaterThanOrEqual(BUILD_CLASS_MAX - 2);
  });

  it('places a mid-size package in the medium range', () => {
    const mullvadVpnBeta = {
      avgPeakMemoryBytes: 5.5 * BYTES_PER_GIB,
      avgCpuTimeNs: 2211 * NS_PER_SECOND,
      avgDiskIoBytes: 6.1 * BYTES_PER_GIB,
      avgDurationSeconds: 692,
    };
    const suggested = suggestBuildClass(mullvadVpnBeta);
    expect(suggested).toBeGreaterThanOrEqual(5);
    expect(suggested).toBeLessThanOrEqual(7);
  });

  it('scores usage at the floor as minimum and above the ceiling as maximum per metric', () => {
    expect(
      suggestBuildClass({
        avgPeakMemoryBytes: 256 * BYTES_PER_MIB,
        avgCpuTimeNs: 60 * NS_PER_SECOND,
        avgDiskIoBytes: 128 * BYTES_PER_MIB,
        avgDurationSeconds: 120,
      }),
    ).toBe(BUILD_CLASS_MIN);
    expect(
      suggestBuildClass({
        avgPeakMemoryBytes: 64 * BYTES_PER_GIB,
        avgCpuTimeNs: 8 * 3600 * NS_PER_SECOND,
        avgDiskIoBytes: 128 * BYTES_PER_GIB,
        avgDurationSeconds: 4 * 3600,
      }),
    ).toBe(BUILD_CLASS_MAX);
  });

  it('redistributes weight when some metrics are missing', () => {
    const memoryOnly = suggestBuildClass({ avgPeakMemoryBytes: 26 * BYTES_PER_GIB });
    expect(memoryOnly).toBe(BUILD_CLASS_MAX);

    // Disk IO at its floor contributes nothing on its own.
    expect(suggestBuildClass({ avgDiskIoBytes: 128 * BYTES_PER_MIB })).toBe(BUILD_CLASS_MIN);
  });

  it('never leaves the configured class range', () => {
    const extremes = [
      { avgPeakMemoryBytes: 0, avgCpuTimeNs: 0, avgDiskIoBytes: 0, avgDurationSeconds: 0 },
      {
        avgPeakMemoryBytes: Number.MAX_SAFE_INTEGER,
        avgCpuTimeNs: Number.MAX_SAFE_INTEGER,
        avgDiskIoBytes: Number.MAX_SAFE_INTEGER,
        avgDurationSeconds: Number.MAX_SAFE_INTEGER,
      },
      ...Object.values([1, 5, 10]).map((factor) => ({
        avgPeakMemoryBytes: factor * BYTES_PER_GIB,
        avgCpuTimeNs: factor * 1000 * NS_PER_SECOND,
        avgDiskIoBytes: factor * BYTES_PER_GIB,
        avgDurationSeconds: factor * 300,
      })),
    ];
    for (const profile of extremes) {
      const suggested = suggestBuildClass(profile);
      expect(suggested).not.toBeNull();
      if (suggested === null) continue;
      expect(suggested).toBeGreaterThanOrEqual(BUILD_CLASS_MIN);
      expect(suggested).toBeLessThanOrEqual(BUILD_CLASS_MAX);
      expect(suggested % 2).toBe(0);
    }
  });
});
