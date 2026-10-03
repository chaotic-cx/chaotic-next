import { describe, expect, it } from 'vitest';
import { MISSING_VALUE } from '../table-columns/missing-value';
import { formatCompactCount } from './compact-number.pipe';

describe('formatCompactCount', () => {
  it('rounds a large count and marks it as approximate', () => {
    expect(formatCompactCount(167_205, 'en')).toBe('~167K');
  });

  it('falls back to the short form for languages without one for thousands', () => {
    expect(formatCompactCount(167_205, 'de')).toBe('~167K');
  });

  it('keeps a small count exact, without the prefix', () => {
    expect(formatCompactCount(842, 'en')).toBe('842');
  });

  it('shows an em dash for an unknown count', () => {
    expect(formatCompactCount(null, 'en')).toBe(MISSING_VALUE);
  });
});
