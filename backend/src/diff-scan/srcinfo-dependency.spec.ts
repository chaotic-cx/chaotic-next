import { describe, expect, it } from 'vitest';
import { makeChange } from './rules/test-support';
import { cleanDepName, parseSrcinfoDepLine, scanSrcinfoDependencies, stripVcsSuffix } from './srcinfo-dependency';

describe('srcinfo-dependency scanner', () => {
  describe('cleanDepName', () => {
    it('strips version operators and descriptions', () => {
      expect(cleanDepName('python')).toBe('python');
      expect(cleanDepName('glibc>=2.34')).toBe('glibc');
      expect(cleanDepName('openssl<3.0')).toBe('openssl');
      expect(cleanDepName('libjpeg-turbo=3.0.0-1')).toBe('libjpeg-turbo');
      expect(cleanDepName('cuda: for GPU acceleration')).toBe('cuda');
      expect(cleanDepName('gcc-libs>=12.1.0: for C++ support')).toBe('gcc-libs');
    });
  });

  describe('parseSrcinfoDepLine', () => {
    it('parses depends, makedepends, checkdepends', () => {
      expect(parseSrcinfoDepLine('depends = python>=3.11')).toEqual({
        type: 'depends',
        rawValue: 'python>=3.11',
        depName: 'python',
      });
      expect(parseSrcinfoDepLine('makedepends = cmake')).toEqual({
        type: 'makedepends',
        rawValue: 'cmake',
        depName: 'cmake',
      });
      expect(parseSrcinfoDepLine('checkdepends = pytest')).toEqual({
        type: 'checkdepends',
        rawValue: 'pytest',
        depName: 'pytest',
      });
    });

    it('ignores comments and non-dependency lines', () => {
      expect(parseSrcinfoDepLine('# depends = python')).toBeNull();
      expect(parseSrcinfoDepLine('pkgname = mypkg')).toBeNull();
      expect(parseSrcinfoDepLine('pkgver = 1.0.0')).toBeNull();
      expect(parseSrcinfoDepLine('optdepends = git: for vcs')).toBeNull();
    });
  });

  describe('stripVcsSuffix', () => {
    it('removes trailing VCS suffixes only', () => {
      expect(stripVcsSuffix('apparmor.d-base-git')).toBe('apparmor.d-base');
      expect(stripVcsSuffix('firefox-svn')).toBe('firefox');
      expect(stripVcsSuffix('plain-pkg')).toBe('plain-pkg');
      expect(stripVcsSuffix('git')).toBe('git');
    });
  });

  describe('scanSrcinfoDependencies', () => {
    it('ignores non-.SRCINFO files', async () => {
      const change = makeChange('@@ -0,0 +1,2 @@\n+depends = missing-pkg\n', { new_path: 'foo/PKGBUILD' });
      const isDepPresent = async () => false;
      const findings = await scanSrcinfoDependencies(change, isDepPresent);
      expect(findings).toHaveLength(0);
    });

    it('warns on missing AUR dependencies in .SRCINFO', async () => {
      const diff = [
        '@@ -0,0 +1,5 @@',
        '+pkgbase = test-pkg',
        '+depends = arch-core-pkg',
        '+depends = missing-aur-dep>=1.0',
        '+makedepends = missing-aur-make-dep',
        '+checkdepends = known-chaotic-pkg',
      ].join('\n');

      const change = makeChange(diff, { new_path: 'test-pkg/.SRCINFO' });
      const known = new Set(['arch-core-pkg', 'known-chaotic-pkg']);
      const isDepPresent = async (dep: string) => known.has(dep);

      const findings = await scanSrcinfoDependencies(change, isDepPresent);
      expect(findings).toHaveLength(2);

      const [first, second] = findings;
      expect(first.ruleId).toBe('CAUR-UNRESOLVED-DEPENDENCY');
      expect(first.severity).toBe('warning');
      expect(first.description).toContain('missing-aur-dep');
      expect(first.match).toBe('depends = missing-aur-dep>=1.0');

      expect(second.ruleId).toBe('CAUR-UNRESOLVED-DEPENDENCY');
      expect(second.description).toContain('missing-aur-make-dep');
      expect(second.match).toBe('makedepends = missing-aur-make-dep');
    });

    it('does not warn when dependencies exist in Arch or Chaotic-AUR', async () => {
      const diff = ['@@ -0,0 +1,3 @@', '+depends = glibc>=2.34', '+makedepends = gcc'].join('\n');

      const change = makeChange(diff, { new_path: '.SRCINFO' });
      const isDepPresent = async () => true;

      const findings = await scanSrcinfoDependencies(change, isDepPresent);
      expect(findings).toHaveLength(0);
    });

    it('does not warn for split packages depending on their -git siblings', async () => {
      const diff = [
        '@@ -0,0 +1,10 @@',
        '+pkgbase = apparmor.d-git',
        '+depends = apparmor>=4.1.3',
        '+pkgname = apparmor.d-git',
        '+depends = apparmor',
        '+depends = apparmor.d-base',
        '+depends = apparmor.d-tools',
        '+pkgname = apparmor.d-base-git',
        '+pkgdesc = Full set of apparmor profiles (base abstractions)',
        '+pkgname = apparmor.d-tools-git',
      ].join('\n');

      const change = makeChange(diff, { new_path: 'apparmor.d-git/.SRCINFO' });
      const isDepPresent = async (dep: string) => dep === 'apparmor';

      const findings = await scanSrcinfoDependencies(change, isDepPresent);
      expect(findings).toHaveLength(0);
    });

    it('does not warn when a dependency matches a sibling pkgname exactly', async () => {
      const diff = [
        '@@ -0,0 +1,4 @@',
        '+pkgname = mytool',
        '+depends = mylib',
        '+pkgname = mylib',
        '+makedepends = truly-missing-dep',
      ].join('\n');

      const change = makeChange(diff, { new_path: 'mytool/.SRCINFO' });
      const isDepPresent = async () => false;

      const findings = await scanSrcinfoDependencies(change, isDepPresent);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.description).toContain('truly-missing-dep');
    });

    it('does not warn when a dependency is satisfied by a provides entry of the same source', async () => {
      const diff = ['@@ -0,0 +1,3 @@', '+pkgname = myfs-git', '+provides = myfs=1.2.3', '+depends = myfs'].join('\n');

      const change = makeChange(diff, { new_path: 'myfs-git/.SRCINFO' });
      const isDepPresent = async () => false;

      const findings = await scanSrcinfoDependencies(change, isDepPresent);
      expect(findings).toHaveLength(0);
    });

    it('considers pkgname declarations outside the edited hunks', async () => {
      const diff = ['@@ -1,2 +1,3 @@', ' pkgname = libfoo-git', '+depends = libfoo'].join('\n');

      const change = makeChange(diff, { new_path: 'libfoo-git/.SRCINFO' });
      const isDepPresent = async () => false;

      const findings = await scanSrcinfoDependencies(change, isDepPresent);
      expect(findings).toHaveLength(0);
    });
  });
});
