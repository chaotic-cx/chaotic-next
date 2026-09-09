import type { ArchOverlapReport } from '@chaotic-next/shared-lib';
import { describe, expect, it } from 'vitest';
import { visibleArchOverlapRows } from './chart-arch-overlap.component';

function row(overrides: Partial<ArchOverlapReport>): ArchOverlapReport {
  return { pkgname: 'pkg', ...overrides };
}

describe('visibleArchOverlapRows', () => {
  it('sorts by pkgname', () => {
    const rows = [row({ pkgname: 'zeta' }), row({ pkgname: 'alpha' }), row({ pkgname: 'beta' })];
    expect(visibleArchOverlapRows(rows).map((r) => r.pkgname)).toEqual(['alpha', 'beta', 'zeta']);
  });

  it('keeps provides-matched entries (pkgbaseName alias counts as overlap)', () => {
    // The service maps provides/pkbaseName → arch, component just sorts – ensure no filter drops them
    const rows = [row({ pkgname: 'virt-consumer' }), row({ pkgname: 'base-consumer' })];
    expect(visibleArchOverlapRows(rows)).toHaveLength(2);
  });
});
