import { describe, expect, it } from 'vitest';
import { computeQueueEstimates, formatEta, overallAverageMinutes, type PackageBuildAverage } from './queue-estimates';

const MINUTE_MS = 60_000;

function averages(entries: Record<string, [number, number]>): (pkgname: string) => number | undefined {
  const map = new Map<string, number>(
    Object.entries(entries).map(([pkgname, [averageMinutes]]) => [pkgname, averageMinutes]),
  );
  return (pkgname: string) => map.get(pkgname);
}

describe('overallAverageMinutes', () => {
  it('weights packages by sample count', () => {
    const entries: PackageBuildAverage[] = [
      { pkgname: 'a', averageMinutes: 10, samples: 3 },
      { pkgname: 'b', averageMinutes: 20, samples: 1 },
    ];
    expect(overallAverageMinutes(entries)).toBe(12.5);
  });

  it('returns undefined without samples', () => {
    expect(overallAverageMinutes([])).toBeUndefined();
  });
});

describe('computeQueueEstimates', () => {
  it('estimates remaining time of running builds', () => {
    const now = 10 * MINUTE_MS;
    const result = computeQueueEstimates({
      active: [{ pkgname: 'a', startedMs: 0 }],
      waiting: [],
      idleCount: 1,
      nowMs: now,
      avgOf: averages({ a: [30] }),
    });
    expect(result.activeFinish.get('a')).toBe(20);
    expect(result.queueClear).toBe(20);
  });

  it('clamps finished estimates at zero', () => {
    const result = computeQueueEstimates({
      active: [{ pkgname: 'a', startedMs: 0 }],
      waiting: [],
      idleCount: 0,
      nowMs: 60 * MINUTE_MS,
      avgOf: averages({ a: [30] }),
    });
    expect(result.activeFinish.get('a')).toBe(0);
  });

  it('lets idle builders start the first waiting packages immediately', () => {
    const result = computeQueueEstimates({
      active: [],
      waiting: ['a', 'b', 'c'],
      idleCount: 2,
      nowMs: 0,
      avgOf: averages({ a: [10], b: [10], c: [10] }),
    });
    expect(result.waitingStart.get('a')).toBe(0);
    expect(result.waitingStart.get('b')).toBe(0);
    // Both builders are busy for ~10m before c can start.
    expect(result.waitingStart.get('c')).toBe(10);
    expect(result.queueClear).toBe(20);
  });

  it('makes the first wave wait for the running builds', () => {
    const result = computeQueueEstimates({
      active: [
        { pkgname: 'x', startedMs: 0 },
        { pkgname: 'y', startedMs: 0 },
      ],
      waiting: ['a', 'b', 'c'],
      idleCount: 0,
      nowMs: 0,
      avgOf: averages({ x: [10], y: [10], a: [10], b: [10], c: [10] }),
    });
    // Two builders, two 10m builds running: a and b start after ~10m, c after ~20m.
    expect(result.waitingStart.get('a')).toBe(10);
    expect(result.waitingStart.get('b')).toBe(10);
    expect(result.waitingStart.get('c')).toBe(20);
    expect(result.queueClear).toBe(30);
  });

  it('runs waves in parallel across all builders', () => {
    const result = computeQueueEstimates({
      active: [],
      waiting: ['a', 'b', 'c', 'd', 'e'],
      idleCount: 2,
      nowMs: 0,
      avgOf: averages({ a: [10], b: [10], c: [10], d: [10], e: [10] }),
    });
    // Waves: [a, b] (immediate), [c, d] (after 10m), [e] (after 20m).
    expect(result.waitingStart.get('d')).toBe(10);
    expect(result.waitingStart.get('e')).toBe(20);
    expect(result.queueClear).toBe(30);
  });

  it('falls back when a package has no history', () => {
    const result = computeQueueEstimates({
      active: [{ pkgname: 'unknown-pkg', startedMs: 0 }],
      waiting: [],
      idleCount: 0,
      nowMs: 0,
      avgOf: (pkgname) => (pkgname === 'known' ? 10 : undefined),
    });
    expect(result.activeFinish.get('unknown-pkg')).toBeUndefined();
    expect(result.queueClear).toBeUndefined();
  });

  it('returns no estimates without builders', () => {
    const result = computeQueueEstimates({
      active: [],
      waiting: ['a'],
      idleCount: 0,
      nowMs: 0,
      avgOf: averages({ a: [10] }),
    });
    expect(result.waitingStart.size).toBe(0);
    expect(result.queueClear).toBeUndefined();
  });

  it('returns no estimates when nothing has history', () => {
    const result = computeQueueEstimates({
      active: [],
      waiting: ['a', 'b'],
      idleCount: 2,
      nowMs: 0,
      avgOf: () => undefined,
    });
    expect(result.waitingStart.size).toBe(0);
    expect(result.queueClear).toBeUndefined();
  });
});

describe('formatEta', () => {
  it('renders sub-minute estimates', () => {
    expect(formatEta(0)).toBe('~<1m');
    expect(formatEta(0.9)).toBe('~<1m');
  });

  it('renders minutes and hours without padding', () => {
    expect(formatEta(6)).toBe('~6m');
    expect(formatEta(90)).toBe('~1h 30m');
    expect(formatEta(60)).toBe('~1h');
  });
});
