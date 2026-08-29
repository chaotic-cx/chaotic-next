import { describe, expect, it } from 'vitest';
import { parsePkgbuild, parseSrcinfoVariables, registerSrcinfoVariables } from './pkgbuild';
import { makeChange } from './rules/test-support';

describe('parsePkgbuild', () => {
  it('resolves variables in source entries', () => {
    const change = makeChange(
      [
        '@@ -0,0 +1,5 @@',
        '+pkgname=demo',
        '+pkgver=1.0',
        '+url="https://download.kde.org/stable"',
        '+source=("$url/$pkgname-$pkgver.tar.xz")',
      ].join('\n'),
    );

    expect(parsePkgbuild(change)?.entries[0]?.raw).toBe('https://download.kde.org/stable/demo-1.0.tar.xz');
  });

  it('keeps the raw entry when a variable cannot be resolved', () => {
    const change = makeChange(['@@ -0,0 +1,3 @@', '+pkgver=1.0', '+source=("$_undefined_var/file.tar.xz")'].join('\n'));

    expect(parsePkgbuild(change)?.entries[0]?.raw).toBe('$_undefined_var/file.tar.xz');
  });

  it('derives hosts from resolved sources so rules can see them', () => {
    const change = makeChange(
      ['@@ -0,0 +1,4 @@', '+pkgname=demo', '+url="https://kde.org/"', '+source=("$url/app.tar.xz")'].join('\n'),
    );

    const parsed = parsePkgbuild(change);
    expect(parsed?.entries[0]?.host).toBe('kde.org');
  });

  it('splits makepkg filename::url sources and derives the host from the URL part', () => {
    const change = makeChange(
      [
        '@@ -0,0 +1,5 @@',
        '+pkgname=demo',
        '+pkgver=1.0',
        '+url="https://download.example.org/releases"',
        '+source=("$pkgname-$pkgver.tar.xz::$url/downloads/$pkgname.tar.xz")',
      ].join('\n'),
    );

    const entry = parsePkgbuild(change)?.entries[0];
    expect(entry?.fileName).toBe('demo-1.0.tar.xz');
    expect(entry?.url).toBe('https://download.example.org/releases/downloads/demo.tar.xz');
    expect(entry?.host).toBe('download.example.org');
  });

  it('expands bash substring operations like ${commit::7} in source entries', () => {
    const change = makeChange(
      [
        '@@ -0,0 +1,4 @@',
        '+_commit=fee63112daf6ca7130c71997ce56fe381cdffcca',
        '+_ext=tar.gz',
        '+source=("runtime-${_commit::7}.$_ext"::"https://github.com/org/repo/archive/$_commit.$_ext")',
      ].join('\n'),
    );

    const entry = parsePkgbuild(change)?.entries[0];
    expect(entry?.fileName).toBe('runtime-fee6311.tar.gz');
    expect(entry?.raw).toBe(
      'runtime-fee6311.tar.gz::https://github.com/org/repo/archive/fee63112daf6ca7130c71997ce56fe381cdffcca.tar.gz',
    );
    expect(entry?.host).toBe('github.com');
  });

  it('resolves option variables declared with the ": ${var:=default}" idiom', () => {
    const change = makeChange(
      [
        '@@ -0,0 +1,3 @@',
        `+: "\${_branch:=daily-1039}"`,
        '+source=("https://example.org/snapshots/${_branch}.tar.zst")',
      ].join('\n'),
    );

    expect(parsePkgbuild(change)?.entries[0]?.raw).toBe('https://example.org/snapshots/daily-1039.tar.zst');
  });

  it('uses the first element of pkgname arrays for ${pkgname}, as bash does', () => {
    const change = makeChange(
      [
        '@@ -0,0 +1,3 @@',
        "+pkgname=('shelly' 'shelly-flatpak-backend')",
        '+pkgver=3.1.0',
        '+source=("${pkgname}-${pkgver}.tar.gz::https://github.com/org/repo/archive/v${pkgver}.tar.gz")',
      ].join('\n'),
    );

    const entry = parsePkgbuild(change)?.entries[0];
    expect(entry?.fileName).toBe('shelly-3.1.0.tar.gz');
    expect(entry?.url).toBe('https://github.com/org/repo/archive/v3.1.0.tar.gz');
  });

  it('resolves variables through other variables (pkgname=$_pkgname)', () => {
    const change = makeChange(
      [
        '@@ -0,0 +1,4 @@',
        '+_pkgname=demo',
        '+pkgname="$_pkgname"',
        '+pkgver=2.0',
        '+source=("https://files.example/$pkgname-$pkgver.zip")',
      ].join('\n'),
    );

    expect(parsePkgbuild(change)?.entries[0]?.raw).toBe('https://files.example/demo-2.0.zip');
  });

  it("does not split filename::url at the '::' inside an unresolved ${var::n}", () => {
    const change = makeChange(
      ['@@ -0,0 +1,2 @@', '+_commit=$(git rev-parse HEAD)', '+source=("${_commit::7}.tar.gz"::"https://f.org/x")'].join(
        '\n',
      ),
    );

    const entry = parsePkgbuild(change)?.entries[0];
    expect(entry?.fileName).toBe('${_commit::7}.tar.gz');
    expect(entry?.url).toBe('https://f.org/x');
  });

  it('expands pattern replacement like ${pkgver//./-} in source entries (freeipa)', () => {
    const change = makeChange(
      [
        '@@ -0,0 +1,3 @@',
        '+pkgbase=freeipa',
        '+pkgver=4.13.3',
        '+source=("https://codeberg.org/${pkgbase}/${pkgbase}/releases/download/release-${pkgver//./-}/${pkgbase}-${pkgver}.tar.gz"{,.asc})',
      ].join('\n'),
    );

    expect(parsePkgbuild(change)?.entries[0]?.raw).toBe(
      'https://codeberg.org/freeipa/freeipa/releases/download/release-4-13-3/freeipa-4.13.3.tar.gz{,.asc}',
    );
  });

  it('handles single-occurrence replacement and anchored trims', () => {
    const change = makeChange(
      [
        '@@ -0,0 +1,2 @@',
        '+_name=pkg-tool',
        '+source=("https://files.example/${_name/pkg-tool/pkg}" "${_name#pkg-}.tar.gz" "archive/${_name%-tool}.zip")',
      ].join('\n'),
    );
    const entries = parsePkgbuild(change)?.entries.map((entry) => entry.raw) ?? [];

    expect(entries).toEqual(['https://files.example/pkg', 'tool.tar.gz', 'archive/pkg.zip']);
  });

  it('keeps glob patterns unresolvable instead of guessing', () => {
    const change = makeChange(
      ['@@ -0,0 +1,2 @@', '+_tag=v1', '+source=("https://files.example/${_tag//*/x}.tar.gz")'].join('\n'),
    );

    expect(parsePkgbuild(change)?.entries[0]?.raw).toBe('https://files.example/${_tag//*/x}.tar.gz');
  });

  it('ignores variables assigned inside function bodies', () => {
    const change = makeChange(
      [
        '@@ -0,0 +1,5 @@',
        '+pkgver() {',
        '+  pkgver=9.9.9',
        '+}',
        '+source=("https://files.example/$pkgname-$pkgver.zip")',
      ].join('\n'),
    );
    const parsed = parsePkgbuild(change);

    expect(parsed?.vars.get('pkgver')).toBeUndefined();
    expect(parsed?.entries[0]?.raw).toContain('$pkgver');
  });
});

describe('SRCINFO variable resolution', () => {
  it('extracts scalar assignments from tab-indented .SRCINFO lines', () => {
    const change = makeChange(
      [
        '@@ -1,4 +1,4 @@',
        'pkgbase = demo',
        '\tpkgdesc = A demo',
        '\tpkgver = 1.0',
        '\turl = https://github.com/example/demo',
      ].join('\n'),
      { new_path: 'demo/.SRCINFO', old_path: 'demo/.SRCINFO' },
    );
    const vars = parseSrcinfoVariables(change);

    expect(vars.get('pkgver')).toBe('1.0');
    expect(vars.get('url')).toBe('https://github.com/example/demo');
  });

  it('folds sibling .SRCINFO vars in so a clipped url= still resolves the host', () => {
    const pkgbuild = makeChange(
      [
        '@@ -1,4 +1,4 @@',
        '# Maintainer: dev',
        '',
        ' pkgname=demo',
        '+pkgver=1.0',
        ' pkgrel=1',
        " arch=('x86_64')",
        '@@ -20,3 +20,3 @@',
        ' source=("$pkgname-$pkgver.tar.gz"::"${url}/archive/v${pkgver}.tar.gz")',
      ].join('\n'),
      { new_path: 'demo/PKGBUILD', old_path: 'demo/PKGBUILD' },
    );
    const srcinfo = makeChange(
      [
        '@@ -1,4 +1,4 @@',
        'pkgbase = demo',
        '\tpkgrel = 1',
        '\turl = https://github.com/example/demo',
        '\tpkgver = 1.0',
      ].join('\n'),
      { new_path: 'demo/.SRCINFO', old_path: 'demo/.SRCINFO' },
    );

    expect(parsePkgbuild(pkgbuild)?.entries[0]?.host).toBeNull();

    registerSrcinfoVariables(pkgbuild, parseSrcinfoVariables(srcinfo));
    const parsed = parsePkgbuild(pkgbuild);
    expect(parsed?.entries[0]?.host).toBe('github.com');
    expect(parsed?.urlHost).toBe('github.com');
  });

  it('keeps the PKGBUILD declaration when it and the .SRCINFO conflict', () => {
    const pkgbuild = makeChange(
      ['@@ -0,0 +1,3 @@', '+pkgname=demo', '+pkgver=2.0', '+url="https://own.example.org/"'].join('\n'),
      { new_path: 'demo/PKGBUILD', old_path: 'demo/PKGBUILD' },
    );
    const srcinfo = makeChange(
      ['@@ -1,2 +1,2 @@', 'pkgbase = demo', '\turl = https://srcinfo.example.org/'].join('\n'),
      { new_path: 'demo/.SRCINFO', old_path: 'demo/.SRCINFO' },
    );

    registerSrcinfoVariables(pkgbuild, parseSrcinfoVariables(srcinfo));
    const parsed = parsePkgbuild(pkgbuild);
    expect(parsed?.vars.get('url')).toBe('https://own.example.org/');
    expect(parsed?.urlHost).toBe('own.example.org');
  });
});
