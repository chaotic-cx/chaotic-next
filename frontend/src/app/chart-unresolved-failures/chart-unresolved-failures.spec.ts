import type { UnresolvedFailedBuild } from '@chaotic-next/shared-lib';
import { describe, expect, it } from 'vitest';
import { isRateLimited, streakDurationLabel, visibleFailureRows } from './chart-unresolved-failures.component';

function row(overrides: Partial<UnresolvedFailedBuild>): UnresolvedFailedBuild {
  return {
    pkgname: 'pkg',
    status: 3,
    statusText: 'failure',
    timestamp: '2026-08-25T00:00:00.000Z',
    streakStartedAt: '2026-08-24T00:00:00.000Z',
    logUrl: null,
    consecutiveFailures: 1,
    silenced: false,
    ...overrides,
  };
}

describe('visibleFailureRows', () => {
  const rows = [
    row({ pkgname: 'low-streak-active', consecutiveFailures: 1 }),
    row({ pkgname: 'silenced-high-streak', consecutiveFailures: 9, silenced: true }),
    row({ pkgname: 'active-high-streak', consecutiveFailures: 5 }),
    row({ pkgname: 'silenced-low-streak', consecutiveFailures: 2, silenced: true }),
  ];

  it('hides silenced rows by default and ranks by streak', () => {
    expect(visibleFailureRows(rows, false).map((r) => r.pkgname)).toEqual(['active-high-streak', 'low-streak-active']);
  });

  it('keeps silenced rows visible at their ranked position when shown', () => {
    expect(visibleFailureRows(rows, true).map((r) => r.pkgname)).toEqual([
      'silenced-high-streak',
      'active-high-streak',
      'silenced-low-streak',
      'low-streak-active',
    ]);
  });

  it('never drops active rows, however many longer streaks exist above them', () => {
    const many = [
      ...Array.from({ length: 60 }, (unused, index) => row({ pkgname: `active-${index}`, consecutiveFailures: 3 })),
      row({ pkgname: 'single-recent-failure' }),
      row({ pkgname: 'silenced-top', consecutiveFailures: 99, silenced: true }),
    ];
    const visible = visibleFailureRows(many, false);
    expect(visible).toHaveLength(61);
    expect(visible.every((r) => r.pkgname !== 'silenced-top')).toBe(true);
    expect(visible.some((r) => r.pkgname === 'single-recent-failure')).toBe(true);
    expect(visible.some((r) => r.pkgname === 'silenced-top')).toBe(false);
  });

  it('breaks streak ties with the newer failure first', () => {
    const tied = [
      row({ pkgname: 'older', timestamp: '2026-08-20T00:00:00.000Z' }),
      row({ pkgname: 'newer', timestamp: '2026-08-24T00:00:00.000Z' }),
    ];
    expect(visibleFailureRows(tied, false).map((r) => r.pkgname)).toEqual(['newer', 'older']);
  });
});

describe('isRateLimited', () => {
  const NOW = Date.parse('2026-08-25T12:00:00.000Z');
  const HOUR_MS = 60 * 60 * 1000;

  it('flags a package at the failure limit with a fresh attempt', () => {
    const fresh = row({ consecutiveFailures: 5, timestamp: new Date(NOW - 1 * HOUR_MS).toISOString() });
    expect(isRateLimited(fresh, NOW)).toBe(true);
  });

  it('spares packages below the failure limit', () => {
    const low = row({ consecutiveFailures: 4, timestamp: new Date(NOW - 1 * HOUR_MS).toISOString() });
    expect(isRateLimited(low, NOW)).toBe(false);
  });

  it('spares packages whose newest attempt is older than the retry cooldown', () => {
    const stale = row({ consecutiveFailures: 9, timestamp: new Date(NOW - 24 * HOUR_MS).toISOString() });
    expect(isRateLimited(stale, NOW)).toBe(false);
  });

  it('treats an unparseable timestamp as not rate limited', () => {
    const broken = row({ consecutiveFailures: 9, timestamp: 'not-a-date' });
    expect(isRateLimited(broken, NOW)).toBe(false);
  });
});

describe('streakDurationLabel', () => {
  const NOW = Date.parse('2026-08-25T12:00:00.000Z');

  it('renders sub-hour streaks with a placeholder', () => {
    expect(streakDurationLabel(new Date(NOW - 20 * 60 * 1000).toISOString(), NOW)).toBe('<1h');
  });

  it('renders hour precision below two days', () => {
    expect(streakDurationLabel(new Date(NOW - 5 * 60 * 60 * 1000).toISOString(), NOW)).toBe('5h');
    expect(streakDurationLabel(new Date(NOW - 47 * 60 * 60 * 1000).toISOString(), NOW)).toBe('47h');
  });

  it('switches to day precision from two days on', () => {
    expect(streakDurationLabel(new Date(NOW - 48 * 60 * 60 * 1000).toISOString(), NOW)).toBe('2d');
    expect(streakDurationLabel(new Date(NOW - 9.4 * 24 * 60 * 60 * 1000).toISOString(), NOW)).toBe('9d');
  });

  it('returns an empty label for unparseable input', () => {
    expect(streakDurationLabel('not-a-date', NOW)).toBe('');
  });
});
