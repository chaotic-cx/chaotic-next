import { describe, expect, it, vi } from 'vitest';
import { makeChange } from './rules/test-support';
import {
  cleanDepName,
  isDependencyPresent,
  parseSrcinfoDepLine,
  providesSatisfied,
  scanSrcinfoDependencies,
} from './srcinfo-dependency';

function fakeRepo(options: { foundRow?: { id: number }; providesHit?: boolean } = {}) {
  const queryState = { sql: '', params: {} as Record<string, unknown> };
  const builder = {
    where: (sql: string) => {
      queryState.sql += ` ${sql}`;
      return builder;
    },
    andWhere: (sql: string) => {
      queryState.sql += ` ${sql}`;
      return builder;
    },
    setParameter: (name: string, value: unknown) => {
      queryState.params[name] = value;
      return builder;
    },
    select: () => builder,
    getOne: async () => (options.providesHit ? { id: 1 } : null),
  };
  return {
    queryState,
    findOne: vi.fn(async () => options.foundRow ?? null),
    createQueryBuilder: vi.fn(() => builder),
  };
}

describe('isDependencyPresent', () => {
  it('short-circuits when the dependency is a package name', async () => {
    const archRepo = fakeRepo({ foundRow: { id: 1 } });
    const present = await isDependencyPresent('curl', archRepo as never);
    expect(present).toBe(true);
    expect(archRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('matches versioned soname provides from Arch metadata', async () => {
    const archRepo = fakeRepo({ providesHit: true });
    const present = await isDependencyPresent('libcurl.so', archRepo as never);

    expect(present).toBe(true);
    expect(archRepo.queryState.params.dep).toBe('libcurl.so');
    expect(providesSatisfied('arch')).toContain("split_part(provided, '=', 1)");
  });

  it('checks Chaotic packages for provides when Arch misses', async () => {
    const chaoticRepo = fakeRepo({ providesHit: true });
    const present = await isDependencyPresent('libzstd.so', undefined, chaoticRepo as never);

    expect(present).toBe(true);
    expect(chaoticRepo.queryState.params.dep).toBe('libzstd.so');
    expect(chaoticRepo.queryState.sql).toContain('isActive');
  });

  it('reports absent dependencies only after both repos miss', async () => {
    const archRepo = fakeRepo();
    const chaoticRepo = fakeRepo();
    const present = await isDependencyPresent('totally-missing', archRepo as never, chaoticRepo as never);

    expect(present).toBe(false);
    expect(archRepo.findOne).toHaveBeenCalled();
    expect(chaoticRepo.createQueryBuilder).toHaveBeenCalled();
  });
});

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

    it('does not warn for split packages depending on their exact siblings', async () => {
      const diff = [
        '@@ -0,0 +1,9 @@',
        '+pkgbase = kernel-modules-hook-git',
        '+pkgname = kernel-modules-hook-git',
        '+depends = systemd',
        '+depends = cleanup',
        '+pkgname = cleanup',
        '+provides = kernel-modules-cleanup',
        '+pkgname = hardcode',
      ].join('\n');

      const change = makeChange(diff, { new_path: 'kernel-modules-hook-git/.SRCINFO' });
      const isDepPresent = async (dep: string) => dep === 'systemd';

      const findings = await scanSrcinfoDependencies(change, isDepPresent);
      expect(findings).toHaveLength(0);
    });

    it('still warns when a dependency only differs from a sibling by a VCS suffix', async () => {
      const diff = [
        '@@ -0,0 +1,7 @@',
        '+pkgbase = apparmor.d-git',
        '+pkgname = apparmor.d-git',
        '+depends = apparmor',
        '+depends = apparmor.d-base',
        '+pkgname = apparmor.d-base-git',
        '+pkgdesc = Full set of apparmor profiles (base abstractions)',
      ].join('\n');

      const change = makeChange(diff, { new_path: 'apparmor.d-git/.SRCINFO' });
      const isDepPresent = async (dep: string) => dep === 'apparmor';

      const findings = await scanSrcinfoDependencies(change, isDepPresent);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.description).toContain('apparmor.d-base');
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
      const diff = ['@@ -1,2 +1,3 @@', ' pkgname = libfoo', '+depends = libfoo'].join('\n');

      const change = makeChange(diff, { new_path: 'libfoo-git/.SRCINFO' });
      const isDepPresent = async () => false;

      const findings = await scanSrcinfoDependencies(change, isDepPresent);
      expect(findings).toHaveLength(0);
    });

    it('walks the AUR dependency tree of a missing dep when a fetcher is provided', async () => {
      const diff = ['@@ -0,0 +1,3 @@', '+pkgbase = spotdl', '+depends = python-datastar-py'].join('\n');

      const change = makeChange(diff, { new_path: 'spotdl/.SRCINFO' });
      const present = new Set(['python']);
      const isDepPresent = async (dep: string) => present.has(dep);
      const aurDeps: Record<string, string[]> = {
        'python-datastar-py': ['python-spotapi', 'python>=3.11'],
        'python-spotapi': ['python-tls-client', 'python-readerwriterlock'],
        'python-tls-client': ['python'],
        'python-readerwriterlock': ['python'],
      };
      const fetchAurDependencies = async (name: string): Promise<string[] | null> => aurDeps[name] ?? null;

      const findings = await scanSrcinfoDependencies(change, isDepPresent, fetchAurDependencies);

      expect(findings).toHaveLength(4);
      expect(findings[0]?.match).toBe('depends = python-datastar-py');
      const matches = findings.map((finding) => finding.match);
      expect(matches).toEqual(
        expect.arrayContaining(['python-spotapi', 'python-tls-client', 'python-readerwriterlock']),
      );
    });

    it('reports every transitive missing dep with its origin chain', async () => {
      const diff = ['@@ -0,0 +1,3 @@', '+pkgbase = spotdl', '+depends = python-datastar-py'].join('\n');

      const change = makeChange(diff, { new_path: 'spotdl/.SRCINFO' });
      const isDepPresent = async () => false;
      const aurDeps: Record<string, string[]> = {
        'python-datastar-py': ['python-spotapi', 'python-spotipyfree'],
        'python-spotapi': ['python-tls-client'],
        'python-tls-client': ['lib-tls-client'],
        'python-spotipyfree': ['python-readerwriterlock'],
      };
      const fetchAurDependencies = async (name: string): Promise<string[] | null> => aurDeps[name] ?? null;

      const findings = await scanSrcinfoDependencies(change, isDepPresent, fetchAurDependencies);

      const matches = findings.map((finding) => finding.match);
      expect(matches).toEqual(
        expect.arrayContaining([
          'python-spotapi',
          'python-spotipyfree',
          'python-tls-client',
          'lib-tls-client',
          'python-readerwriterlock',
        ]),
      );

      const spotapi = findings.find((finding) => finding.match === 'python-spotapi');
      expect(spotapi?.description).toContain('via python-datastar-py');
    });

    it('stops walking when it reaches a dependency present locally', async () => {
      const diff = ['@@ -0,0 +1,3 @@', '+pkgbase = spotdl', '+depends = python-datastar-py'].join('\n');

      const change = makeChange(diff, { new_path: 'spotdl/.SRCINFO' });
      const present = new Set(['python-spotapi', 'python-tls-client']);
      const isDepPresent = async (dep: string) => present.has(dep);
      const aurDeps: Record<string, string[]> = {
        'python-datastar-py': ['python-spotapi', 'python-spotipyfree'],
        'python-spotipyfree': ['python-readerwriterlock'],
        'python-readerwriterlock': ['python-spotapi'],
      };
      const fetchAurDependencies = async (name: string): Promise<string[] | null> => aurDeps[name] ?? null;

      const findings = await scanSrcinfoDependencies(change, isDepPresent, fetchAurDependencies);

      const matches = findings.map((finding) => finding.match);
      expect(matches).toEqual(expect.arrayContaining(['python-spotipyfree', 'python-readerwriterlock']));
      expect(matches).not.toContain('python-spotapi');
      expect(matches).not.toContain('python-tls-client');
    });

    it('handles dependency cycles without infinite recursion', async () => {
      const diff = ['@@ -0,0 +1,3 @@', '+pkgbase = spotdl', '+depends = python-datastar-py'].join('\n');

      const change = makeChange(diff, { new_path: 'spotdl/.SRCINFO' });
      const isDepPresent = async () => false;
      const aurDeps: Record<string, string[]> = {
        'python-datastar-py': ['python-spotapi'],
        'python-spotapi': ['python-datastar-py'],
      };
      const fetchAurDependencies = async (name: string): Promise<string[] | null> => aurDeps[name] ?? null;

      const findings = await scanSrcinfoDependencies(change, isDepPresent, fetchAurDependencies);

      const matches = findings.map((finding) => finding.match);
      expect(matches).toEqual(expect.arrayContaining(['python-spotapi']));
    });

    it('ignores a fetcher returning no deps', async () => {
      const diff = ['@@ -0,0 +1,3 @@', '+pkgbase = spotdl', '+depends = missing-aur-dep'].join('\n');

      const change = makeChange(diff, { new_path: 'spotdl/.SRCINFO' });
      const isDepPresent = async () => false;
      const fetchAurDependencies = async (): Promise<string[] | null> => null;

      const findings = await scanSrcinfoDependencies(change, isDepPresent, fetchAurDependencies);

      expect(findings).toHaveLength(1);
      expect(findings[0]?.match).toBe('depends = missing-aur-dep');
    });

    it('shares expanded subtrees across sibling missing deps', async () => {
      const diff = [
        '@@ -0,0 +1,4 @@',
        '+pkgbase = spotdl',
        '+depends = python-datastar-py',
        '+depends = python-spotahy',
      ].join('\n');

      const change = makeChange(diff, { new_path: 'spotdl/.SRCINFO' });
      const isDepPresent = async () => false;
      const aurDeps: Record<string, string[]> = {
        'python-datastar-py': ['python-shared'],
        'python-spotahy': ['python-shared'],
        'python-shared': ['python-leaf'],
        'python-leaf': [],
      };
      const fetchAurDependencies = async (name: string): Promise<string[] | null> => aurDeps[name] ?? null;

      const findings = await scanSrcinfoDependencies(change, isDepPresent, fetchAurDependencies);

      const matches = findings.map((finding) => finding.match);
      expect(matches).toEqual(expect.arrayContaining(['python-shared', 'python-leaf']));
      expect(matches).toContain('depends = python-datastar-py');
      expect(matches).toContain('depends = python-spotahy');
    });

    it('surfaces the real spotdl transitive missing deps (python-tls-client, lib-tls-client)', async () => {
      const diff = [
        '@@ -0,0 +1,3 @@',
        '+pkgbase = spotdl',
        '+depends = python-datastar-py',
        '+depends = python-spotipyfree',
      ].join('\n');

      const change = makeChange(diff, { new_path: 'spotdl/.SRCINFO' });

      // Officially available: Arch python and the AUR packages we already package.
      const available = new Set(['python', 'python-pymongo', 'python-readerwriterlock']);
      const isDepPresent = async (dep: string) => available.has(dep);

      // Real AUR /info Depends graph (trimmed to the relevant subtree).
      const aurDeps: Record<string, string[]> = {
        'python-datastar-py': ['python'],
        'python-spotipyfree': ['python', 'python-pymongo', 'python-spotapi'],
        'python-spotapi': ['python', 'python-pymongo', 'python-readerwriterlock', 'python-tls-client'],
        'python-tls-client': ['lib-tls-client'],
        'lib-tls-client': ['python'],
      };
      const fetchAurDependencies = async (name: string): Promise<string[] | null> => aurDeps[name] ?? null;

      const findings = await scanSrcinfoDependencies(change, isDepPresent, fetchAurDependencies);

      const matches = findings.map((finding) => finding.match);
      expect(matches).toEqual(expect.arrayContaining(['python-spotapi', 'python-tls-client', 'lib-tls-client']));
      expect(matches).not.toContain('python-readerwriterlock');

      const tlsClient = findings.find((finding) => finding.match === 'python-tls-client');
      expect(tlsClient?.description).toContain('via python-spotipyfree -> python-spotapi');
      expect(tlsClient?.description).toContain("AUR dependency tree of 'python-spotipyfree'");
      expect(tlsClient?.ruleName).toBe('Transitive AUR dependency in .SRCINFO');
      const libTlsClient = findings.find((finding) => finding.match === 'lib-tls-client');
      expect(libTlsClient?.description).toContain('via python-spotipyfree -> python-spotapi -> python-tls-client');
    });
  });
});
