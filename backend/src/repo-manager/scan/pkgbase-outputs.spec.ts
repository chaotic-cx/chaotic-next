import { describe, expect, it } from 'vitest';
import { type Package } from '../../builder/builder.entity';
import { groupByPkgbase, recordedDeps } from './pkgbase-outputs';

function pkg(overrides: Partial<Package>): Package {
  return { id: 1, pkgname: 'mesa-tkg-git', pkgbaseName: null, ...overrides } as Package;
}

describe('groupByPkgbase', () => {
  it('groups split outputs with the package of their PKGBUILD', () => {
    const groups = groupByPkgbase([
      pkg({ id: 1, pkgname: 'mesa-tkg-git' }),
      pkg({ id: 2, pkgname: 'lib32-mesa-tkg-git', pkgbaseName: 'mesa-tkg-git' }),
      pkg({ id: 3, pkgname: 'vala-panel-appmenu-budgie', pkgbaseName: 'vala-panel-appmenu' }),
    ]);

    expect(groups.get('mesa-tkg-git')?.map((output) => output.id)).toEqual([1, 2]);
    expect(groups.get('vala-panel-appmenu')?.map((output) => output.id)).toEqual([3]);
  });
});

describe('recordedDeps', () => {
  it('returns null while the package has no metadata', () => {
    expect(recordedDeps(pkg({ metadata: null as unknown as Package['metadata'] }))).toBeNull();
  });

  it('returns an empty list for a package without dependencies', () => {
    expect(recordedDeps(pkg({ metadata: { buildDate: '0', filename: 'x.pkg.tar.zst' } }))).toEqual([]);
  });
});
