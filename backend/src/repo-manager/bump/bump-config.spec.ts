import { applyPackageBump, parseCiConfig } from './bump-config';
import { describe, expect, it } from 'vitest';

describe('parseCiConfig', () => {
  it('keeps values that themselves contain = intact (a naive split would truncate)', () => {
    const config = parseCiConfig('CI_PKGBUILD_SOURCE=https://example.com/a=b?c=d\nBUILDER_CLASS=9\n');
    expect(config['CI_PKGBUILD_SOURCE']).toBe('https://example.com/a=b?c=d');
    expect(config['BUILDER_CLASS']).toBe('9');
  });

  it('skips lines without a separator', () => {
    const config = parseCiConfig('# comment\nCI_PACKAGE_BUMP=1.0-1/1\n');
    expect(Object.keys(config)).toEqual(['CI_PACKAGE_BUMP']);
  });

  it('maps an empty value to the empty string', () => {
    expect(parseCiConfig('CI_REBUILD_TRIGGERS=\n')['CI_REBUILD_TRIGGERS']).toBe('');
  });
});

describe('applyPackageBump', () => {
  // Real .CI/config from pkgbuilds/mesa-tkg-git — bump line in the middle, real source URL.
  const mesaConfig =
    [
      'CI_ON_TRIGGER=daily',
      'BUILDER_CACHE_SOURCES=true',
      'CI_PACKAGE_BUMP=26.2.0_devel.221337.b860e0132f9-1/1',
      'CI_REBUILD_TRIGGERS=libxml2:libdisplay-info',
      'CI_PKGBUILD_SOURCE=https://github.com/Frogging-Family/mesa-git.git',
    ].join('\n') + '\n';
  const mesaVersion = '26.2.0_devel.221337.b860e0132f9';

  it('increments the counter for the same version and preserves every other line byte-for-byte', () => {
    expect(applyPackageBump(mesaConfig, mesaVersion, 1)).toBe(
      mesaConfig.replace(
        'CI_PACKAGE_BUMP=26.2.0_devel.221337.b860e0132f9-1/1',
        'CI_PACKAGE_BUMP=26.2.0_devel.221337.b860e0132f9-1/2',
      ),
    );
  });

  it('preserves the real key order across a bump (pkgbuilds/kicad-git config)', () => {
    const original =
      [
        'BUILDER_CACHE_SOURCES=true',
        'CI_PACKAGE_BUMP=10.99.0.r2148.g26c2468-1/1',
        'CI_REBUILD_TRIGGERS=boost:poppler:protobuf',
        'CI_PKGBUILD_SOURCE=aur',
        'BUILDER_CLASS=9',
      ].join('\n') + '\n';

    expect(applyPackageBump(original, '10.99.0.r2148.g26c2468', 1)).toBe(
      original.replace('CI_PACKAGE_BUMP=10.99.0.r2148.g26c2468-1/1', 'CI_PACKAGE_BUMP=10.99.0.r2148.g26c2468-1/2'),
    );
  });

  it('resets the counter to 1 when the version changed since the last bump (matches .ci/manual-bump.sh)', () => {
    // Existing bump is for 130.0-1; the package is now at 131.0-2 → fresh counter.
    expect(applyPackageBump('CI_PACKAGE_BUMP=130.0-1/9\n', '131.0', 2)).toBe('CI_PACKAGE_BUMP=131.0-2/1\n');
  });

  it('keeps incrementing the counter when the package already has a fractional pkgrel recorded', () => {
    // `130.0-2/9` built pkgrel `2.9` (pkgrel=2, bump=9); the next bump must go
    // to `130.0-2/10` (`2.10`), not reset the counter to 1.
    expect(applyPackageBump('CI_PACKAGE_BUMP=130.0-2/9\n', '130.0', 2)).toBe('CI_PACKAGE_BUMP=130.0-2/10\n');
  });

  it('starts the counter at 1 when the existing bump has no /counter', () => {
    expect(applyPackageBump('CI_PACKAGE_BUMP=131.0-2\n', '131.0', 2)).toBe('CI_PACKAGE_BUMP=131.0-2/1\n');
  });

  it('inserts a single CI_PACKAGE_BUMP line above CI_REBUILD_TRIGGERS when absent (matches repo convention)', () => {
    expect(applyPackageBump('CI_PKGBUILD_SOURCE=aur\nCI_REBUILD_TRIGGERS=boost:poppler:protobuf\n', '1.98.2', 2)).toBe(
      'CI_PKGBUILD_SOURCE=aur\nCI_PACKAGE_BUMP=1.98.2-2/1\nCI_REBUILD_TRIGGERS=boost:poppler:protobuf\n',
    );
  });

  it('inserts CI_PACKAGE_BUMP above CI_PKGBUILD_SOURCE when absent and no CI_REBUILD_TRIGGERS exists', () => {
    expect(applyPackageBump('CI_PKGBUILD_SOURCE=aur\n', '1.98.2', 2)).toBe(
      'CI_PACKAGE_BUMP=1.98.2-2/1\nCI_PKGBUILD_SOURCE=aur\n',
    );
  });

  it('appends to an empty config', () => {
    expect(applyPackageBump('', '1.0', 1)).toBe('CI_PACKAGE_BUMP=1.0-1/1\n');
  });

  it('ensures insertion above CI_PKGBUILD_SOURCE when the file lacks a trailing newline', () => {
    expect(applyPackageBump('CI_PKGBUILD_SOURCE=aur', '1.0', 1)).toBe(
      'CI_PACKAGE_BUMP=1.0-1/1\nCI_PKGBUILD_SOURCE=aur',
    );
  });

  it('handles real-world chaotic-repo pkgver shapes', () => {
    // adwaita-qt-git: long git pkgver, same base → increment.
    expect(applyPackageBump('CI_PACKAGE_BUMP=1.4.1.r29.g0a77436-1/1\n', '1.4.1.r29.g0a77436', 1)).toBe(
      'CI_PACKAGE_BUMP=1.4.1.r29.g0a77436-1/2\n',
    );
    // A -git package with CI_REBUILD_TRIGGERS, bumped again at the same base.
    expect(applyPackageBump('CI_REBUILD_TRIGGERS=icu\nCI_PACKAGE_BUMP=r221.e78bf689-1/2\n', 'r221.e78bf689', 1)).toBe(
      'CI_REBUILD_TRIGGERS=icu\nCI_PACKAGE_BUMP=r221.e78bf689-1/3\n',
    );
  });
});
