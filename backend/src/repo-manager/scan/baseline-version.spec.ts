import { describe, expect, it } from 'vitest';
import { pickBaselineVersion } from './baseline-version';

describe('pickBaselineVersion', () => {
  it('uses the previous version when it was analyzed', () => {
    expect(pickBaselineVersion(['1.0-1', '1.1-1', '1.2-1'], '1.1-1', '1.2-1')).toBe('1.1-1');
  });

  it('falls back to the newest analyzed version older than the current version', () => {
    expect(pickBaselineVersion(['1.0-1', '1.9-1', '1.10-1', '2.0-1'], '1.11-1', '2.0-1')).toBe('1.10-1');
  });

  it('returns null when no older version was analyzed', () => {
    expect(pickBaselineVersion(['2.0-1'], '1.0-1', '2.0-1')).toBeNull();
  });

  it('accepts every analyzed version for a removed package', () => {
    expect(pickBaselineVersion(['1.0-1', '1.2-1'], '1.3-1', null)).toBe('1.2-1');
  });
});
