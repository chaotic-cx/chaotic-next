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

  it('ignores contributions from conditional if/else blocks', () => {
    const conditional = [
      ...PKGBUILD_LINES.slice(0, 7),
      "depends=('dbus' 'gtk3')",
      'if [[ "${_with_extras::1}" == "t" ]]; then',
      '  depends+=(',
      '    libextra.so # extras',
      '  )',
      'else',
      '  depends+=(',
      '    libother.so',
      '  )',
      'fi',
    ];

    // makepkg evaluated the default branch, so .SRCINFO carries the extras —
    // the static parser cannot replay that choice and must stay silent.
    const generated = [
      ...SRCINFO_LINES.filter((line) => !line.startsWith('depends')),
      'depends = dbus',
      'depends = gtk3',
      'depends = libextra.so',
    ];
    expect(scan(conditional, generated)).toHaveLength(0);
  });

  it('strips inline comments inside arrays instead of treating them as entries', () => {
    const commented = [
      ...PKGBUILD_LINES.slice(0, 7),
      'depends=(',
      '  glibc # runtime',
      "  'curl>=8.0'",
      ')',
      "makedepends=('git')",
    ];
    expect(scan(commented, SRCINFO_LINES)).toHaveLength(0);
  });

  it('keeps a quoted pkgdesc with parentheses a scalar, not an array', () => {
    const withParens = [
      ...PKGBUILD_LINES.slice(0, 3),
      'pkgdesc="Multi-protocol client with AI and cloud storage (FTP, FTPS, SFTP, WebDAV, S3)"',
      ...PKGBUILD_LINES.slice(4),
    ];
    const generated = SRCINFO_LINES.map((line) =>
      line === 'pkgdesc = A test package'
        ? 'pkgdesc = Multi-protocol client with AI and cloud storage (FTP, FTPS, SFTP, WebDAV, S3)'
        : line,
    );
    expect(scan(withParens, generated)).toHaveLength(0);
  });

  it('substitutes variables when comparing scalars', () => {
    const templated = [...PKGBUILD_LINES, '_base_version=1.2.3'].map((line) =>
      line === 'pkgver=1.2.3' ? 'pkgver=$_base_version' : line,
    );
    expect(scan(templated, SRCINFO_LINES)).toHaveLength(0);
  });

  it('recognizes ": ${var:=default}" declarations for comparisons', () => {
    const defaulted = PKGBUILD_LINES.map((line) => (line === 'pkgrel=1' ? ': "${_rel:=1}"' : line));
    defaulted.splice(defaulted.indexOf(': "${_rel:=1}"') + 1, 0, 'pkgrel=$_rel');
    expect(scan(defaulted, SRCINFO_LINES)).toHaveLength(0);
  });

  describe('source sequence comparison', () => {
    const pkgLines = [
      'pkgbase=freeipa',
      'pkgver=4.13.3',
      "url='https://www.freeipa.org/'",
      'license=(GPL-3.0-or-later)',
      'source=("https://codeberg.org/${pkgbase}/releases/download/release-${pkgver//./-}/${pkgbase}-${pkgver}.tar.gz"{,.asc}',
      '  nis-domainname.service)',
    ];
    const srcinfoLines = [
      'pkgbase = freeipa',
      'pkgver = 4.13.3',
      'url = https://www.freeipa.org/',
      'license = GPL-3.0-or-later',
      'source = https://codeberg.org/freeipa/releases/download/release-4-13-3/freeipa-4.13.3.tar.gz',
      'source = https://codeberg.org/freeipa/releases/download/release-4-13-3/freeipa-4.13.3.tar.gz.asc',
      'source = nis-domainname.service',
      '',
      'pkgname = freeipa',
    ];

    it('accepts resolved, brace-expanded sources in order', () => {
      expect(scan(pkgLines, srcinfoLines)).toHaveLength(0);
    });

    it('reports a stale source URL at its .SRCINFO line', () => {
      const stale = srcinfoLines.map((line) =>
        line.startsWith('source = https://codeberg')
          ? line.replace('codeberg.org', 'pagure.org').replace('4-13-3', '4-13-1').replace('4.13.3', '4.13.1')
          : line,
      );
      const hits = scan(pkgLines, stale);

      expect(hits).toHaveLength(1);
      expect(hits[0]?.note).toContain("'source'");
      expect(hits[0]?.note).toContain('pagure.org');
    });

    it('treats a reordered source list as drift', () => {
      const reordered = [...srcinfoLines];
      const firstIndex = reordered.indexOf('source = nis-domainname.service');
      reordered.splice(firstIndex, 1);
      reordered.splice(
        reordered.findIndex((line) => line.startsWith('source =')) ?? 0,
        0,
        'source = nis-domainname.service',
      );
      expect(scan(pkgLines, reordered)).toHaveLength(1);
    });

    it('stays silent when sources contain unresolvable variables', () => {
      const templated = [...pkgLines, 'source=("https://mirror.example/${_secret_tag}/pkg.tar.gz")'];
      expect(scan(templated, srcinfoLines)).toHaveLength(0);
    });

    it('ignores conditional source contributions instead of judging them', () => {
      const conditional = [
        ...pkgLines,
        'if [[ "${_with_extra::1}" == "t" ]]; then',
        '  source+=("https://files.example/extra.patch")',
        'fi',
      ];
      expect(scan(conditional, srcinfoLines)).toHaveLength(0);
    });
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
