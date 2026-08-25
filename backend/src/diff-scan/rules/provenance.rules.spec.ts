import { describe, expect, it } from 'vitest';
import { PROVENANCE_RULES } from './provenance.rules';
import { makeChange, ruleById } from './test-support';

describe('provenance rules', () => {
  it('flags VCS sources outside reputable forges', () => {
    const change = makeChange(
      [
        '@@ -10,7 +10,8 @@ pkgver=1.0',
        ' url="https://example.org/project/"',
        ' source=(',
        '+  "git+https://git.somewhere-odd.example/payload.git"',
        '   "https://example.org/release.tar.gz"',
        ' )',
      ].join('\n'),
    );
    expect(ruleById(PROVENANCE_RULES, 'SRC-001').check(change)?.note).toContain('git.somewhere-odd.example');
  });

  it('accepts reputable git sources with an unrelated url=', () => {
    const change = makeChange(
      [
        '@@ -10,7 +10,8 @@ pkgver=1.0',
        ' url="https://example.org/project/"',
        ' source=(',
        '+  "git+https://github.com/upstream/project.git"',
        ' )',
      ].join('\n'),
    );
    expect(PROVENANCE_RULES.flatMap((rule) => rule.check(change) ?? [])).toHaveLength(0);
  });

  it('flags sources on generic file hosts', () => {
    const change = makeChange(
      ['@@ -10,7 +10,8 @@', ' source=(', '+  "https://cdn.example.netlify.app/payload"', ' )'].join('\n'),
    );
    expect(ruleById(PROVENANCE_RULES, 'SRC-002').check(change)).not.toBeNull();
  });

  it('flags source hosts unrelated to the url= upstream (CHAOS-RAT pattern)', () => {
    const change = makeChange(
      [
        '@@ -12,6 +12,7 @@',
        ' url="https://kde.org/applications/"',
        ' source=(',
        '+  "https://some-personal-site.example/fix.patch"',
        '   "https://download.kde.org/stable/app/1.0.tar.xz"',
        ' )',
      ].join('\n'),
    );
    const hit = ruleById(PROVENANCE_RULES, 'SRC-003').check(change);
    expect(hit).not.toBeNull();
    expect(hit?.line).toBe(14);
  });

  it('accepts distro, registry and vendor mirror hosts unrelated to the url= upstream', () => {
    const change = makeChange(
      [
        '@@ -12,6 +12,8 @@',
        ' url="https://example.org/myfont/"',
        ' source=(',
        '+  "$pkgname.tar.gz::https://web.archive.org/web/2024/pkg.tar.gz"',
        '+  "git+https://git.code.sf.net/p/$pkgname/code"',
        ' )',
      ].join('\n'),
    );
    expect(ruleById(PROVENANCE_RULES, 'SRC-003').check(change)).toBeNull();
  });

  it('reports the line of a variable-resolved source entry', () => {
    const change = makeChange(
      [
        '@@ -0,0 +1,5 @@',
        '+pkgver=1.0',
        '+_gentoo=firefox-154-patches-01.tar.xz',
        '+url="https://gitlab.com/upstream/pkg"',
        '+source=("https://dev.gentoo.org/~someone/mozilla/patchsets/$_gentoo")',
      ].join('\n'),
    );
    const hit = ruleById(PROVENANCE_RULES, 'SRC-003').check(change);
    expect(hit?.line).toBe(4);
  });

  it('does not compare against url= when the diff does not show it', () => {
    const change = makeChange(
      ['@@ -50,3 +50,4 @@', ' source=(', '+  "https://some-personal-site.example/fix.patch"', ' )'].join('\n'),
    );
    expect(ruleById(PROVENANCE_RULES, 'SRC-003').check(change)).toBeNull();
  });

  it('ignores source-like arrays outside PKGBUILDs', () => {
    const change = makeChange(
      ['@@ -1,2 +1,3 @@', ' url="https://example.org/"', '+source=("https://cdn.example.netlify.app/payload")'].join(
        '\n',
      ),
      { new_path: 'foo/build.sh' },
    );
    expect(PROVENANCE_RULES.flatMap((rule) => rule.check(change) ?? [])).toHaveLength(0);
  });

  it('flags sources whose host stays hidden behind unresolvable variables', () => {
    const change = makeChange(
      [
        '@@ -1,4 +1,5 @@',
        '+url="https://example.org/project/"',
        '+source=("https://mirror.example/${_tag}/pkg.tar.gz" "$_patch_url")',
        '+_tag=$(git describe --tags)',
      ].join('\n'),
    );
    const hit = ruleById(PROVENANCE_RULES, 'CAUR-UNRESOLVED-SOURCE').check(change);
    expect(hit).not.toBeNull();
    expect(hit?.note).toContain('unresolved');
  });

  it('does not flag sources whose variables resolve', () => {
    const change = makeChange(
      [
        '@@ -0,0 +1,4 @@',
        '+_gentoo=firefox-154-patches-01.tar.xz',
        '+url="https://gitlab.com/upstream/pkg"',
        '+source=("https://dev.gentoo.org/~someone/mozilla/patchsets/$_gentoo")',
      ].join('\n'),
    );
    expect(ruleById(PROVENANCE_RULES, 'CAUR-UNRESOLVED-SOURCE').check(change)).toBeNull();
  });
});

describe('SRC-004 checksum rule', () => {
  const checksumRule = () => ruleById(PROVENANCE_RULES, 'SRC-004');

  it('flags sources without any checksum array', () => {
    const change = makeChange(
      ['@@ -0,0 +1,3 @@', '+url="https://example.org/project/"', '+source=("https://example.org/release.tar.gz")'].join(
        '\n',
      ),
    );
    expect(checksumRule().check(change)?.note).toContain('no checksum array');
  });

  it('flags sources verified only by a weak checksum', () => {
    const change = makeChange(
      [
        '@@ -0,0 +1,4 @@',
        '+url="https://example.org/project/"',
        '+source=("https://example.org/release.tar.gz")',
        "+md5sums=('d41d8cd98f00b204e9800998ecf8427e')",
      ].join('\n'),
    );
    expect(checksumRule().check(change)?.note).toContain('weak checksums');
  });

  it('flags SKIP checksums on downloadable sources', () => {
    const change = makeChange(
      [
        '@@ -0,0 +1,4 @@',
        '+url="https://example.org/project/"',
        '+source=("https://example.org/release.tar.gz")',
        "+sha256sums=('SKIP')",
      ].join('\n'),
    );
    expect(checksumRule().check(change)?.note).toContain('is SKIP');
  });

  it('accepts SKIP checksums that only cover VCS sources', () => {
    const change = makeChange(
      [
        '@@ -0,0 +1,4 @@',
        '+url="https://github.com/upstream/project"',
        '+source=("git+https://github.com/upstream/project.git" "https://example.org/release.tar.gz")',
        "+sha256sums=('SKIP' 'd41d8cd98f00b204e9800998ecf8427ed41d8cd98f00b204e9800998ecf8427e')",
      ].join('\n'),
    );
    expect(checksumRule().check(change)).toBeNull();
  });

  it('accepts SKIP checksums on commit-pinned archive sources', () => {
    const change = makeChange(
      [
        '@@ -0,0 +1,4 @@',
        '+url="https://github.com/upstream/project"',
        '+source=("pkg.tar.gz::https://github.com/upstream/project/archive/fee63112daf6ca7130c71997ce56fe381cdffcca.tar.gz")',
        "+sha256sums=('SKIP')",
      ].join('\n'),
    );
    expect(checksumRule().check(change)).toBeNull();
  });

  it('accepts fully verified sources', () => {
    const change = makeChange(
      [
        '@@ -0,0 +1,4 @@',
        '+url="https://example.org/project/"',
        '+source=("https://example.org/release.tar.gz")',
        "+sha256sums=('d41d8cd98f00b204e9800998ecf8427ed41d8cd98f00b204e9800998ecf8427e')",
      ].join('\n'),
    );
    expect(checksumRule().check(change)).toBeNull();
  });
});
