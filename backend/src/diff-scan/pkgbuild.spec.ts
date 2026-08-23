import { describe, expect, it } from 'vitest';
import { parsePkgbuild } from './pkgbuild';
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
});
