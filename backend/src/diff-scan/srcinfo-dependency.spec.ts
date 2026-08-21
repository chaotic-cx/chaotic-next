import { describe, expect, it } from 'vitest';
import { makeChange } from './rules/test-support';
import { cleanDepName, parseSrcinfoDepLine, scanSrcinfoDependencies } from './srcinfo-dependency';

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
  });
});
