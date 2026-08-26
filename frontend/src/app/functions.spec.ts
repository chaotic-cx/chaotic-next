import { describe, expect, it } from 'vitest';
import { isLogPurged, vtIndicatorLink } from './functions';

describe('vtIndicatorLink', () => {
  it('passes file hashes through unchanged', () => {
    expect(vtIndicatorLink({ type: 'file', value: 'abc123' })).toBe('https://www.virustotal.com/gui/file/abc123');
  });

  it('routes URL indicators through the search endpoint with an encoded query', () => {
    expect(vtIndicatorLink({ type: 'url', value: 'https://evil.example/payload.sh' })).toBe(
      'https://www.virustotal.com/gui/search?query=https%3A%2F%2Fevil.example%2Fpayload.sh',
    );
  });
});

describe('isLogPurged', () => {
  const NOW = Date.parse('2026-08-25T12:00:00.000Z');
  const DAY_MS = 24 * 60 * 60 * 1000;

  it('marks builds older than the retention window as purged', () => {
    expect(isLogPurged(new Date(NOW - 8 * DAY_MS).toISOString(), NOW)).toBe(true);
  });

  it('keeps builds within the retention window available', () => {
    expect(isLogPurged(new Date(NOW - 6 * DAY_MS).toISOString(), NOW)).toBe(false);
  });

  it('accepts Date instances', () => {
    expect(isLogPurged(new Date(NOW - 8 * DAY_MS), NOW)).toBe(true);
  });

  it('treats an unparseable timestamp as not purged', () => {
    expect(isLogPurged('not-a-date', NOW)).toBe(false);
  });
});
