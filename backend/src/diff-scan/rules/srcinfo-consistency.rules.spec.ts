import { describe, expect, it } from 'vitest';
import { addedOnlyDiff, makeChange, ruleById } from './test-support';
import { SRCINFO_CONSISTENCY_RULES, srcinfoConsistencyHits } from './srcinfo-consistency.rules';

const RULE = () => ruleById(SRCINFO_CONSISTENCY_RULES, 'CAUR-SRCINFO-MISMATCH');

const PKGBUILD_LINES = [
  'pkgname=testpkg',
  'pkgver=1.2.3',
  'pkgrel=1',
  "pkgdesc='A test package'",
  'url="https://example.com/testpkg"',
  "arch=('x86_64' 'aarch64')",
  "license=('MIT')",
  "depends=('glibc' 'curl>=8.0')",
  "makedepends=('git')",
];

const SRCINFO_LINES = [
  'pkgbase = testpkg',
  'pkgdesc = A test package',
  'url = https://example.com/testpkg',
  'pkgver = 1.2.3',
  'pkgrel = 1',
  'arch = x86_64',
  'arch = aarch64',
  'license = MIT',
  'depends = glibc',
  'depends = curl>=8.0',
  'makedepends = git',
  '',
  'pkgname = testpkg',
];

function scan(pkgLines: string[], srcinfoLines: string[]) {
  const pkgChange = makeChange(addedOnlyDiff(pkgLines), { new_path: 'testpkg/PKGBUILD', new_file: true });
  const srcChange = makeChange(addedOnlyDiff(srcinfoLines), { new_path: 'testpkg/.SRCINFO', new_file: true });
  return srcinfoConsistencyHits([pkgChange, srcChange]);
}

describe('srcinfo-consistency rules', () => {
  it('is registered as a full-file rule', () => {
    expect(RULE().runsOn).toEqual(['full-file']);
    expect(srcinfoConsistencyHits([makeChange('@@ -0,0 +1 @@\n+anything')])).toHaveLength(0);
  });

  it('reports nothing when .SRCINFO is generated from the PKGBUILD', () => {
    expect(scan(PKGBUILD_LINES, SRCINFO_LINES)).toHaveLength(0);
  });

  it('reports a stale pkgver at its .SRCINFO line', () => {
    const stale = SRCINFO_LINES.map((line) => (line === 'pkgver = 1.2.3' ? 'pkgver = 1.2.2' : line));
    const hits = scan(PKGBUILD_LINES, stale);

    expect(hits).toHaveLength(1);
    expect(hits[0]?.file).toBe('testpkg/.SRCINFO');
    expect(hits[0]?.line).toBe(4);
    expect(hits[0]?.match).toBe('pkgver = 1.2.2');
    expect(hits[0]?.note).toContain('"1.2.3"');
    expect(hits[0]?.note).toContain('"1.2.2"');
  });

  it('reports dependencies present only in the PKGBUILD', () => {
    const withoutCurl = SRCINFO_LINES.filter((line) => line !== 'depends = curl>=8.0');
    const hits = scan(PKGBUILD_LINES, withoutCurl);

    expect(hits).toHaveLength(1);
    expect(hits[0]?.note).toContain("'depends'");
    expect(hits[0]?.note).toContain('curl>=8.0');
  });

  it('tolerates list reordering but not membership changes', () => {
    const reordered = [...PKGBUILD_LINES];
    reordered[6] = "arch=('aarch64' 'x86_64')";
    expect(scan(reordered, SRCINFO_LINES)).toHaveLength(0);
  });

  it('stays silent on arrays with unresolvable variable references', () => {
    const templated = PKGBUILD_LINES.map((line) => (line.startsWith('depends=') ? 'depends=("${_deps[@]}")' : line));
    expect(scan(templated, SRCINFO_LINES)).toHaveLength(0);
  });

  it('parses multiline and appended arrays', () => {
    const multiline = [
      ...PKGBUILD_LINES.slice(0, 7),
      'depends=(',
      "  'glibc'",
      "  'curl>=8.0'",
      ')',
      "makedepends+=('cmake')",
    ];
    const regenerated = SRCINFO_LINES.map((line) => (line === 'makedepends = git' ? 'makedepends = cmake' : line));
    expect(scan(multiline, regenerated)).toHaveLength(0);
  });

  it('compares only the pkgbase section, ignoring split-package overrides', () => {
    const split = [...SRCINFO_LINES, '', 'pkgname = testpkg-split', 'depends = glibc', 'provides = something-extra'];
    expect(scan(PKGBUILD_LINES, split)).toHaveLength(0);
  });

  it('needs both files in the same directory', () => {
    const lonelyPkg = makeChange(addedOnlyDiff(PKGBUILD_LINES), { new_path: 'other/PKGBUILD', new_file: true });
    const lonelySrc = makeChange(addedOnlyDiff(['pkgver = 9.9.9']), { new_path: 'elsewhere/.SRCINFO', new_file: true });
    expect(srcinfoConsistencyHits([lonelyPkg, lonelySrc])).toHaveLength(0);
  });

  describe('real-world split package (apparmor.d-git)', () => {
    const pkgbuildLines = [
      '# shellcheck disable=SC2034,SC2154,SC2164',
      '',
      'pkgbase=apparmor.d-git',
      'pkgname=(',
      '  apparmor.d-git',
      '  apparmor.d-base-git',
      '  apparmor.d-tools-git',
      ')',
      'pkgver=v0.4910.0.r155.g95da007',
      'pkgrel=2',
      'pkgdesc="Full set of apparmor profiles"',
      "arch=('x86_64' 'armv6h' 'armv7h' 'aarch64')",
      'url="https://github.com/roddhjav/apparmor.d"',
      "license=('GPL-2.0-only')",
      "depends=('apparmor>=4.1.3' 'apparmor<5.0.0')",
      "makedepends=('go' 'git' 'just')",
      "conflicts=('apparmor.d')",
      'source=("$pkgname::git+https://github.com/roddhjav/apparmor.d.git")',
      "sha512sums=('SKIP')",
      '',
      'pkgver() {',
      '  cd "$srcdir/$pkgname"',
      "  git describe --long --abbrev=7 | sed 's/\\([^-]*-g\\)/r\\1/;s/-/./g'",
      '}',
    ];

    const srcinfoLines = [
      'pkgbase = apparmor.d-git',
      '\tpkgdesc = Full set of apparmor profiles',
      '\tpkgver = v0.4910.0.r155.g95da007',
      '\tpkgrel = 2',
      '\turl = https://github.com/roddhjav/apparmor.d',
      '\tarch = x86_64',
      '\tarch = armv6h',
      '\tarch = armv7h',
      '\tarch = aarch64',
      '\tlicense = GPL-2.0-only',
      '\tmakedepends = go',
      '\tmakedepends = git',
      '\tmakedepends = just',
      '\tdepends = apparmor>=4.1.3',
      '\tdepends = apparmor<5.0.0',
      '\tconflicts = apparmor.d',
      '\tsource = apparmor.d-git::git+https://github.com/roddhjav/apparmor.d.git',
      '\tsha512sums = SKIP',
      '',
      'pkgname = apparmor.d-git',
      '\tarch = any',
      '\tdepends = apparmor',
      '\tdepends = apparmor.d-base-git',
      '\tdepends = apparmor.d-tools-git',
      '',
      'pkgname = apparmor.d-base-git',
      '\tpkgdesc = Full set of apparmor profiles (base abstractions, tunables, and booleans)',
      '\tarch = any',
      '',
      'pkgname = apparmor.d-tools-git',
      '\tpkgdesc = Full set of apparmor profiles (userland toolings)',
    ];

    it('reports nothing for a freshly generated .SRCINFO of a split package', () => {
      expect(scan(pkgbuildLines, srcinfoLines)).toHaveLength(0);
    });

    it('still notices when only the PKGBUILD moves on', () => {
      const bumped = pkgbuildLines.map((line) => (line === 'pkgrel=2' ? 'pkgrel=3' : line));
      const hits = scan(bumped, srcinfoLines);

      expect(hits).toHaveLength(1);
      expect(hits[0]?.note).toContain("'pkgrel'");
    });
  });
});
