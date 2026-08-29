import { describe, expect, it } from 'vitest';
import {
  computeQueueEstimates,
  formatEta,
  overallAverageMinutes,
  paginateByStartTime,
  type PackageBuildAverage,
  sortByStartTime,
} from './queue-estimates';

const MINUTE_MS = 60_000;

function averages(entries: Record<string, [number]>): (pkgname: string) => number | undefined {
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
      active: [{ rawName: 'a', startedMs: 0, buildClass: 0 }],
      waiting: [],
      idle: [{ buildClass: 0 }],
      nowMs: now,
      avgOf: averages({ a: [30] }),
    });
    expect(result.activeFinish.get('a')).toBe(20);
    expect(result.queueClear).toBe(20);
  });

  it('clamps finished estimates at zero', () => {
    const result = computeQueueEstimates({
      active: [{ rawName: 'a', startedMs: 0, buildClass: 0 }],
      waiting: [],
      idle: [],
      nowMs: 60 * MINUTE_MS,
      avgOf: averages({ a: [30] }),
    });
    expect(result.activeFinish.get('a')).toBe(0);
  });

  it('lets idle builders start the first waiting packages immediately', () => {
    const result = computeQueueEstimates({
      active: [],
      waiting: [
        { rawName: 'a', buildClass: 0 },
        { rawName: 'b', buildClass: 0 },
        { rawName: 'c', buildClass: 0 },
      ],
      idle: [{ buildClass: 0 }, { buildClass: 0 }],
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
        { rawName: 'x', startedMs: 0, buildClass: 0 },
        { rawName: 'y', startedMs: 0, buildClass: 0 },
      ],
      waiting: [
        { rawName: 'a', buildClass: 0 },
        { rawName: 'b', buildClass: 0 },
        { rawName: 'c', buildClass: 0 },
      ],
      idle: [],
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
      waiting: [
        { rawName: 'a', buildClass: 0 },
        { rawName: 'b', buildClass: 0 },
        { rawName: 'c', buildClass: 0 },
        { rawName: 'd', buildClass: 0 },
        { rawName: 'e', buildClass: 0 },
      ],
      idle: [{ buildClass: 0 }, { buildClass: 0 }],
      nowMs: 0,
      avgOf: averages({ a: [10], b: [10], c: [10], d: [10], e: [10] }),
    });
    // Waves: [a, b] (immediate), [c, d] (after 10m), [e] (after 20m).
    expect(result.waitingStart.get('d')).toBe(10);
    expect(result.waitingStart.get('e')).toBe(20);
    expect(result.queueClear).toBe(30);
  });

  it('does not start a build before an eligible builder frees up', () => {
    const result = computeQueueEstimates({
      active: [{ rawName: 'x', startedMs: 0, buildClass: 2 }],
      waiting: [{ rawName: 'a', buildClass: 2 }],
      idle: [],
      nowMs: 0,
      avgOf: averages({ x: [10], a: [5] }),
    });
    // Builder x is busy for ~10m; a cannot start sooner than that.
    expect(result.waitingStart.get('a')).toBe(10);
  });

  it('only uses builders that can run the build class', () => {
    const result = computeQueueEstimates({
      active: [],
      waiting: [{ rawName: 'a', buildClass: 2 }],
      idle: [{ buildClass: 1 }, { buildClass: 3 }],
      nowMs: 0,
      avgOf: averages({ a: [5] }),
    });
    // Class 1 cannot run class 2; only the class 3 builder picks it up.
    expect(result.waitingStart.get('a')).toBe(0);
  });

  it('matches string build classes exactly', () => {
    const result = computeQueueEstimates({
      active: [],
      waiting: [{ rawName: 'a', buildClass: 'mybuildclass' }],
      idle: [{ buildClass: 'other' }, { buildClass: 'mybuildclass' }],
      nowMs: 0,
      avgOf: averages({ a: [5] }),
    });
    expect(result.waitingStart.get('a')).toBe(0);
  });

  it('leaves a build unestimated when no builder can run its class', () => {
    const result = computeQueueEstimates({
      active: [],
      waiting: [{ rawName: 'a', buildClass: 2 }],
      idle: [{ buildClass: 1 }],
      nowMs: 0,
      avgOf: averages({ a: [5] }),
    });
    expect(result.waitingStart.has('a')).toBe(false);
  });

  it('falls back when a package has no history', () => {
    const result = computeQueueEstimates({
      active: [{ rawName: 'unknown-pkg', startedMs: 0, buildClass: 0 }],
      waiting: [],
      idle: [],
      nowMs: 0,
      avgOf: (pkgname) => (pkgname === 'known' ? 10 : undefined),
    });
    expect(result.activeFinish.get('unknown-pkg')).toBeUndefined();
    expect(result.queueClear).toBeUndefined();
  });

  it('returns no estimates without builders', () => {
    const result = computeQueueEstimates({
      active: [],
      waiting: [{ rawName: 'a', buildClass: 0 }],
      idle: [],
      nowMs: 0,
      avgOf: averages({ a: [10] }),
    });
    expect(result.waitingStart.size).toBe(0);
    expect(result.queueClear).toBeUndefined();
  });

  it('returns no estimates when nothing has history', () => {
    const result = computeQueueEstimates({
      active: [],
      waiting: [
        { rawName: 'a', buildClass: 0 },
        { rawName: 'b', buildClass: 0 },
      ],
      idle: [{ buildClass: 0 }, { buildClass: 0 }],
      nowMs: 0,
      avgOf: () => undefined,
    });
    expect(result.waitingStart.size).toBe(0);
    expect(result.queueClear).toBeUndefined();
  });

  it('treats same pkgname from different repos as separate entries', () => {
    const result = computeQueueEstimates({
      active: [],
      waiting: [
        { rawName: 'chaotic-aur/x86_64/firedragon', buildClass: 0 },
        { rawName: 'garuda/x86_64/firedragon', buildClass: 0 },
      ],
      idle: [{ buildClass: 0 }],
      nowMs: 0,
      avgOf: (pkgname) => (pkgname.includes('firedragon') ? 10 : undefined),
    });
    expect(result.waitingStart.get('chaotic-aur/x86_64/firedragon')).toBe(0);
    expect(result.waitingStart.get('garuda/x86_64/firedragon')).toBe(10);
    expect(result.queueClear).toBe(20);
  });

  it('schedules the live queue against eligible builders only', () => {
    const active = [
      { rawName: 'detect-it-easy-git', startedMs: 0, buildClass: 5 },
      { rawName: 'element-desktop-git', startedMs: 0, buildClass: 5 },
    ];
    const idle = [{ buildClass: 'catbuilder' }];
    const waiting = [
      'euphonica-git',
      'fooyin-git',
      'geeqie-git',
      'ghostty-git',
      'gitify-git',
      'glib2-git',
      'goverlay-git',
      'ironbar-git',
      'lib32-vulkan-nouveau-git',
      'linux-firmware-git',
    ].map((rawName) => ({ rawName, buildClass: 5 }));

    const result = computeQueueEstimates({
      active,
      waiting,
      idle,
      nowMs: 0,
      avgOf: (pkgname) => (pkgname === 'detect-it-easy-git' ? 12 : pkgname === 'element-desktop-git' ? 6 : 10),
    });

    // catbuilder is a named-class builder ("catbuilder") and cannot run class 5,
    // so the first queued build can only start when a class-5 builder frees up.
    expect(result.activeFinish.get('detect-it-easy-git')).toBe(12);
    expect(result.activeFinish.get('element-desktop-git')).toBe(6);
    expect(result.waitingStart.get('euphonica-git')).toBe(6);
    expect(result.waitingStart.get('fooyin-git')).toBe(12);
    expect(result.waitingStart.get('geeqie-git')).toBe(16);
  });
});

describe('sortByStartTime', () => {
  it('sorts entries by start time ascending', () => {
    const starts = new Map([
      ['a', 3],
      ['b', 1],
      ['c', 2],
    ]);
    const entries = [{ rawName: 'a' }, { rawName: 'b' }, { rawName: 'c' }];
    expect(sortByStartTime(entries, starts).map((entry) => entry.rawName)).toEqual(['b', 'c', 'a']);
  });

  it('keeps entries without a start time last, preserving relative order', () => {
    const starts = new Map([['a', 1]]);
    const entries = [{ rawName: 'x' }, { rawName: 'a' }, { rawName: 'y' }];
    expect(sortByStartTime(entries, starts).map((entry) => entry.rawName)).toEqual(['a', 'x', 'y']);
  });

  it('does not mutate the input array', () => {
    const starts = new Map([
      ['a', 2],
      ['b', 1],
    ]);
    const entries = [{ rawName: 'a' }, { rawName: 'b' }];
    const before = [...entries];
    sortByStartTime(entries, starts);
    expect(entries).toEqual(before);
  });
});

describe('paginateByStartTime', () => {
  const starts = new Map([
    ['a', 3],
    ['b', 1],
    ['c', 2],
    ['d', 0],
  ]);
  const entries = [{ rawName: 'a' }, { rawName: 'b' }, { rawName: 'c' }, { rawName: 'd' }];

  it('returns the first page sorted by start time', () => {
    expect(paginateByStartTime(entries, starts, 1, 2).map((entry) => entry.rawName)).toEqual(['d', 'b']);
  });

  it('returns the requested later page', () => {
    expect(paginateByStartTime(entries, starts, 2, 2).map((entry) => entry.rawName)).toEqual(['c', 'a']);
  });

  it('returns an empty page past the end', () => {
    expect(paginateByStartTime(entries, starts, 3, 2)).toEqual([]);
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
