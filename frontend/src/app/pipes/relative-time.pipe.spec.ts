import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatRelativeTime, type RelativeTimeLabels } from './relative-time.pipe';

const LABELS: RelativeTimeLabels = { locale: 'en', justNow: 'just now' };

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-30T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" within the past minute', () => {
    expect(formatRelativeTime(new Date('2026-08-30T11:59:30Z'), LABELS)).toBe('just now');
  });

  it('returns "now" for the immediate present and future timestamps', () => {
    expect(formatRelativeTime(new Date('2026-08-30T12:00:00Z'), LABELS)).toBe('now');
    expect(formatRelativeTime(new Date('2026-08-30T12:00:30Z'), LABELS)).toBe('in 30 seconds');
  });

  it('formats past minutes and future dates', () => {
    expect(formatRelativeTime(new Date('2026-08-30T11:55:00Z'), LABELS)).toBe('5 minutes ago');
    expect(formatRelativeTime('2026-09-02T12:00:00Z', LABELS)).toBe('in 3 days');
  });

  it('handles null and invalid input', () => {
    expect(formatRelativeTime(null, LABELS)).toBe('');
    expect(formatRelativeTime('not-a-date', LABELS)).toBe('');
  });
});
