/* eslint-disable @typescript-eslint/no-non-null-assertion -- test fixtures assert on freshly created entities */
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { Package, Repo } from '../builder/builder.entity';
import { TriggerType } from '../interfaces/repo-manager';
import { ArchlinuxPackage, PackageElfAnalysis } from './repo-manager.entity';
import {
  buildDependencyGraph,
  DependencyEdge,
  DependencyNode,
  findBrokenDependencies,
  findSymbolBreaks,
  findVtableBreaks,
  findVtableDrifts,
  formatBrokenDependency,
  latestAnalysisByKey,
} from './signal';
import { ScanJob, SignalScanService } from './scan';
import { SeedTransferService } from './seed-transfer.service';
import { ensureFixtures, FixtureSet } from './test/fixtures';
import { createMockRepository, MockRepository } from './test/mock-repository';

let FIXTURES: FixtureSet;

beforeAll(async () => {
  FIXTURES = await ensureFixtures();
});

function toolsAvailable(): boolean {
  for (const tool of ['bsdtar', 'readelf', 'nm']) {
    const path = `/usr/bin/${tool}`;
    if (!existsSync(path)) {
      try {
        execFileSync('which', [tool], { stdio: 'ignore' });
      } catch {
        return false;
      }
    }
  }
  return true;
}

const TOOLS_AVAILABLE = toolsAvailable();

function pkgByKey(key: string) {
  const pkg = FIXTURES.packages.find((p) => p.key === key);
  if (!pkg) throw new Error(`Unknown fixture key: ${key}`);
  return { ...pkg, path: FIXTURES.paths.get(key)! };
}

function scanJob(key: string): ScanJob {
  const pkg = pkgByKey(key);
  return {
    file: pkg.path,
    pkgType: pkg.pkgType === 'ARCH' ? TriggerType.ARCH : TriggerType.CHAOTIC,
    pkgId: pkg.pkgId,
    version: pkg.version,
  };
}

function createService() {
  const analysisRepo = createMockRepository<PackageElfAnalysis>({
    keyOf: (a) => `${a.pkgType}|${a.pkgId}|${a.version}`,
  });
  const archPkgRepo = createMockRepository<ArchlinuxPackage>({
    keyOf: (p) => String(p.id),
  });
  const packageRepo = createMockRepository<Package>({
    keyOf: (p) => String(p.id),
  });
  const repoRepo = createMockRepository<Repo>({
    keyOf: (r) => String(r.id),
  });

  repoRepo.seed([{ id: 1, name: 'chaotic-aur' } as Repo]);

  archPkgRepo.seed([
    { id: 1001, pkgname: 'kwin', version: '6.7.4-4' } as ArchlinuxPackage,
    { id: 1002, pkgname: 'boost-libs', version: '1.91.0-1' } as ArchlinuxPackage,
    { id: 1003, pkgname: 'icu', version: '78.1-1' } as ArchlinuxPackage,
    { id: 1004, pkgname: 'fmt', version: '12.0.0-1' } as ArchlinuxPackage,
    { id: 1005, pkgname: 'spdlog', version: '1.17.0-1' } as ArchlinuxPackage,
    { id: 1006, pkgname: 'liblphobos', version: '3:1.42.0-1' } as ArchlinuxPackage,
    { id: 1007, pkgname: 'ffmpeg', version: '2:9.0-5' } as ArchlinuxPackage,
  ]);
  packageRepo.seed([
    { id: 2001, pkgname: 'kwin-effects-better-blur-dx', version: '2.5.1-1.5' } as Package,
    { id: 2002, pkgname: 'apollo-git', version: '0.4.8.r24.gadc5c5a-1.1' } as Package,
    { id: 2003, pkgname: 'waybar-git', version: '0.15.0.r959.g084d874-1' } as Package,
    { id: 2004, pkgname: 'autojump', version: '22.5.3-11.1' } as Package,
    { id: 2005, pkgname: 'perl-authen-pam', version: '0.16-14.3' } as Package,
    { id: 2006, pkgname: 'ruby-fusuma-plugin-wmctrl', version: '1.4.2-1' } as Package,
    { id: 2007, pkgname: 'haskell-strict-concurrency', version: '0.2.4.3-1' } as Package,
    { id: 2008, pkgname: 'bluespec-git', version: 'r1127.941eecfe-1' } as Package,
    { id: 2009, pkgname: 'gtkd', version: '3.11.0-4.1' } as Package,
    { id: 2010, pkgname: 'hyprutils-git', version: '0.14.0.r4.g5a7b8cf-1' } as Package,
    { id: 2011, pkgname: 'hyprlang-git', version: '0.6.8.r7.g0901175-1.14' } as Package,
    { id: 2012, pkgname: 'aegisub-arch1t3cht-git', version: '12.r24.g9bfd500-2.15' } as Package,
    { id: 2013, pkgname: 'srb2', version: '2.2.15-1.3' } as Package,
  ]);

  const service = new SignalScanService(analysisRepo, archPkgRepo, packageRepo, repoRepo);
  const seedService = new SeedTransferService(service, analysisRepo, archPkgRepo, packageRepo, repoRepo);
  return { service, seedService, analysisRepo, archPkgRepo, packageRepo, repoRepo };
}

const describeTools = TOOLS_AVAILABLE ? describe : describe.skip;

describeTools('SignalScanService end-to-end', () => {
  describe('single package analysis', () => {
    it('extracts SONAME + NEEDED from kwin', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('kwin-old')]);

      const analysis = Array.from(analysisRepo.store.values()).find((a) => a.version === '6.7.0-1');
      expect(analysis).toBeDefined();
      expect(analysis!.providedSonames).toContain('libkwin.so.6');
      expect(analysis!.neededSonames.length).toBeGreaterThan(0);
    });

    it('extracts imported symbols from better-blur', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('better-blur')]);

      const analysis = Array.from(analysisRepo.store.values())[0];
      expect(analysis).toBeDefined();
      expect(analysis.importedSymbols.length).toBeGreaterThan(0);
      expect(analysis.neededSonames).toContain('libkwin.so.6');
    });

    it('populates the directory index for kwin plugin dirs', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('kwin-old')]);

      const analysis = Array.from(analysisRepo.store.values()).find((a) => a.version === '6.7.0-1');
      expect(analysis).toBeDefined();
      expect(analysis!.directoriesOwned.some((d) => d.startsWith('usr/lib/qt6/plugins/kwin'))).toBe(true);
    });
  });

  describe('plugin detection (derivePluginOf rule 2)', () => {
    it('detects better-blur as a plugin of kwin via the ancestor-segment rule', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('kwin-old'), scanJob('better-blur')]);

      const blur = Array.from(analysisRepo.store.values()).find((a) => a.version === '2.5.1-1.5');
      expect(blur).toBeDefined();
      // Regression for the dead-rule-2 bug: pluginOf must contain kwin's owner
      // key (a1001), resolved via the keyToPkgname map.
      expect(blur!.pluginOf).toContain('a1001');
    });

    it('plugin detection works under concurrency', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('kwin-old'), scanJob('better-blur')], 4);

      const blur = Array.from(analysisRepo.store.values()).find((a) => a.version === '2.5.1-1.5');
      expect(blur!.pluginOf).toContain('a1001');
    });
  });

  describe('vtable extraction', () => {
    it('extracts _ZTV vtable layouts from kwin', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('kwin-old')]);

      const analysis = Array.from(analysisRepo.store.values())[0];
      const vtableKeys = Object.keys(analysis.vtables);
      expect(vtableKeys.length).toBeGreaterThan(50);
      for (const slots of Object.values(analysis.vtables)) {
        expect(Array.isArray(slots)).toBe(true);
      }
    });
  });

  describe('historical drift (kwin 6.7.0 vs 6.7.4)', () => {
    function loadBoth(repo: MockRepository<PackageElfAnalysis>) {
      return {
        old: Array.from(repo.store.values()).find((a) => a.version === '6.7.0-1')!,
        current: Array.from(repo.store.values()).find((a) => a.version === '6.7.4-4')!,
      };
    }

    it('both versions produce analyses with identical SONAME', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('kwin-old'), scanJob('kwin-new')]);

      const { old, current } = loadBoth(analysisRepo);
      expect(old.providedSonames).toContain('libkwin.so.6');
      expect(current.providedSonames).toContain('libkwin.so.6');
    });

    it('symbol diff finds exported symbols lost between versions', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('kwin-old'), scanJob('kwin-new')]);

      const { old, current } = loadBoth(analysisRepo);
      const lost: string[] = [];
      for (const soname of Object.keys(old.exportedSymbols)) {
        const oldSyms = old.exportedSymbols[soname] ?? [];
        const newSyms = new Set(current.exportedSymbols[soname] ?? []);
        for (const s of oldSyms) if (!newSyms.has(s)) lost.push(s);
      }
      // kwin 6.7.0 -> 6.7.4 dropped exactly 4 exported symbols (verified empirically).
      expect(lost.length).toBe(4);
      // These are real dropped symbols from the 6.7.0 -> 6.7.4 window.
      expect(lost).toContain('_ZN4KWin10EglBackend25destroyGlobalShareContextEv');
      expect(lost).toContain('_ZN4KWin10EglBackend8teardownEv');
      expect(lost).toContain('_ZNK4KWin12VulkanDevice13transferQueueEv');
      expect(lost).toContain('_ZNK4KWin12VulkanDevice19transferQueueFamilyEv');
    });

    it('findVtableDrifts runs over both versions', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('kwin-old'), scanJob('kwin-new')]);

      const { old, current } = loadBoth(analysisRepo);
      const drifts = findVtableDrifts(old.vtables, current.vtables);
      for (const d of drifts) {
        expect(d.shiftedSlots.length).toBeGreaterThan(0);
      }
      // Verified: 4 vtables changed layout breakingly across 6.7.0 -> 6.7.4
      // (mid-insertion, not a pure append).
      const vtableNames = drifts.map((d) => d.vtable);
      expect(vtableNames).toContain('_ZTVN4KWin16QuickSceneEffectE');
      expect(vtableNames).toContain('_ZTVN4KWin11OutputLayerE');
      expect(vtableNames.length).toBe(4);
    });

    it('better-blur has a REAL vtable break against kwin 6.7.0 -> 6.7.4', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('kwin-old'), scanJob('kwin-new'), scanJob('better-blur')]);

      const { old, current } = loadBoth(analysisRepo);
      const blur = Array.from(analysisRepo.store.values()).find((a) => a.version === '2.5.1-1.5')!;

      const breaks = findVtableBreaks(blur.importedSymbols, old.vtables, current.vtables);
      // better-blur imports shifted slots of _ZTVN4KWin16QuickSceneEffectE: the
      // layout broke (mid-insertion) and the plugin links into the shifted tail.
      const effectBreaks = breaks.filter((b) => b.vtable === '_ZTVN4KWin16QuickSceneEffectE');
      expect(effectBreaks.length).toBeGreaterThan(0);
      // The shifted slots it imports are real Effect methods it overrides.
      expect(effectBreaks.map((b) => b.slot)).toContain('_ZN4KWin6Effect14tabletToolAxisEPNS_19TabletToolAxisEventE');
    });

    it('findSymbolBreaks finds no false positives across the real diff', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('kwin-old'), scanJob('kwin-new'), scanJob('better-blur')]);

      const { old, current } = loadBoth(analysisRepo);
      const blur = Array.from(analysisRepo.store.values()).find((a) => a.version === '2.5.1-1.5')!;

      // better-blur does not import any of the 4 dropped symbols, so there must
      // be no symbol-level break. This pins that findSymbolBreaks attributes
      // imports to the right library and does not over-report.
      const breaks = findSymbolBreaks(blur.importedSymbols, old.exportedSymbols, current.exportedSymbols);
      expect(breaks).toEqual([]);
    });
  });

  describe('determinism', () => {
    it('repeated scans produce identical pluginOf', async () => {
      const run1 = createService();
      await run1.service.scanPackages([scanJob('kwin-old'), scanJob('better-blur')], 2);
      const blur1 = Array.from(run1.analysisRepo.store.values()).find((a) => a.version === '2.5.1-1.5')!;

      const run2 = createService();
      await run2.service.scanPackages([scanJob('kwin-old'), scanJob('better-blur')], 2);
      const blur2 = Array.from(run2.analysisRepo.store.values()).find((a) => a.version === '2.5.1-1.5')!;

      expect(blur1.pluginOf).toEqual(blur2.pluginOf);
    });
  });

  describe('vendor rebuild trigger: broken-deps channel (soname break)', () => {
    it('boost-libs 1.89→1.91 changes the provided sonames', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('boost-old'), scanJob('boost-new')]);

      const old = Array.from(analysisRepo.store.values()).find((a) => a.version === '1.89.0-1')!;
      const current = Array.from(analysisRepo.store.values()).find((a) => a.version === '1.91.0-1')!;

      // The version-pinned sonames differ: libboost_locale.so.1.89.0 vs .1.91.0
      expect(old.providedSonames).toContain('libboost_locale.so.1.89.0');
      expect(current.providedSonames).toContain('libboost_locale.so.1.91.0');
      expect(old.providedSonames).not.toContain('libboost_locale.so.1.91.0');
      expect(current.providedSonames).not.toContain('libboost_locale.so.1.89.0');
    });

    it('apollo links version-pinned boost sonames', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('apollo')]);

      const apollo = Array.from(analysisRepo.store.values()).find((a) => a.version === '0.4.8.r24.gadc5c5a-1.1')!;
      expect(apollo.neededSonames).toContain('libboost_locale.so.1.91.0');
      expect(apollo.neededSonames).toContain('libboost_log.so.1.91.0');
    });

    it('apollo is NOT broken when boost-libs 1.91 is the provider', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('boost-new'), scanJob('apollo')]);

      const apollo = Array.from(analysisRepo.store.values()).find((a) => a.version === '0.4.8.r24.gadc5c5a-1.1')!;
      const boostNew = Array.from(analysisRepo.store.values()).find((a) => a.version === '1.91.0-1')!;

      const provided = new Set(boostNew.providedSonames);
      const broken = findBrokenDependencies({
        neededSonames: apollo.neededSonames,
        files: apollo.files,
        providedSonames: provided,
        checkSonames: true,
      });

      const boostBreaks = broken.filter((b) => {
        if (b.kind !== 'soname' || !b.soname) return false;
        return b.soname.includes('boost');
      });
      expect(boostBreaks).toEqual([]);
    });

    it('apollo IS broken when only boost-libs 1.89 is the provider → triggers rebuild', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('boost-old'), scanJob('apollo')]);

      const apollo = Array.from(analysisRepo.store.values()).find((a) => a.version === '0.4.8.r24.gadc5c5a-1.1')!;
      const boostOld = Array.from(analysisRepo.store.values()).find((a) => a.version === '1.89.0-1')!;

      const provided = new Set(boostOld.providedSonames);
      const broken = findBrokenDependencies({
        neededSonames: apollo.neededSonames,
        files: apollo.files,
        providedSonames: provided,
        checkSonames: true,
      });

      // apollo needs libboost_locale.so.1.91.0, but 1.89 only provides .1.89.0.
      const boostBreaks = broken
        .filter((b) => b.kind === 'soname')
        .map((b) => (b as { soname: string }).soname)
        .filter((s) => s.includes('boost'));

      expect(boostBreaks).toContain('libboost_locale.so.1.91.0');
      expect(boostBreaks).toContain('libboost_log.so.1.91.0');
      expect(boostBreaks.length).toBeGreaterThanOrEqual(3);

      // This is the BROKEN_DEPS bump trigger: the missing soname means the
      // package must be rebuilt against the new boost-libs.
    });

    it('icu 76→78 changes the provided sonames', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('icu-old'), scanJob('icu-new')]);

      const old = Array.from(analysisRepo.store.values()).find((a) => a.version === '76.1-1')!;
      const current = Array.from(analysisRepo.store.values()).find((a) => a.version === '78.1-1')!;

      expect(old.providedSonames).toContain('libicui18n.so.76');
      expect(current.providedSonames).toContain('libicui18n.so.78');
      expect(current.providedSonames).not.toContain('libicui18n.so.76');
    });
  });

  describe('vendor rebuild trigger: fmt soname break (undetected by manual trigger)', () => {
    it('fmt 11→12 changes the provided soname', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('fmt-old'), scanJob('fmt-new')]);

      const old = Array.from(analysisRepo.store.values()).find((a) => a.version === '11.2.0-1')!;
      const current = Array.from(analysisRepo.store.values()).find((a) => a.version === '12.0.0-1')!;

      expect(old.providedSonames).toContain('libfmt.so.11');
      expect(current.providedSonames).toContain('libfmt.so.12');
      expect(current.providedSonames).not.toContain('libfmt.so.11');
    });

    it('waybar links libfmt.so.12 and libspdlog.so.1.17', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('waybar')]);

      const waybar = Array.from(analysisRepo.store.values()).find((a) => a.version.includes('0.15.0'))!;
      expect(waybar.neededSonames).toContain('libfmt.so.12');
      expect(waybar.neededSonames).toContain('libspdlog.so.1.17');
    });

    it('waybar IS broken when only fmt 11 is the provider (manual trigger misses this)', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('fmt-old'), scanJob('waybar')]);

      const waybar = Array.from(analysisRepo.store.values()).find((a) => a.version.includes('0.15.0'))!;
      const fmtOld = Array.from(analysisRepo.store.values()).find((a) => a.version === '11.2.0-1')!;

      const broken = findBrokenDependencies({
        neededSonames: waybar.neededSonames,
        files: waybar.files,
        providedSonames: new Set(fmtOld.providedSonames),
        checkSonames: true,
      });

      const fmtBreak = broken
        .filter((b) => b.kind === 'soname')
        .map((b) => (b as { soname: string }).soname)
        .filter((s) => s.includes('fmt'));

      // waybar needs libfmt.so.12, fmt 11 only provides libfmt.so.11.
      expect(fmtBreak).toContain('libfmt.so.12');
    });
  });

  describe('vendor rebuild trigger: spdlog soname break (matches manual trigger)', () => {
    it('spdlog 1.15→1.17 changes the provided soname', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('spdlog-old'), scanJob('spdlog-new')]);

      const old = Array.from(analysisRepo.store.values()).find((a) => a.version === '1.15.3-1')!;
      const current = Array.from(analysisRepo.store.values()).find((a) => a.version === '1.17.0-1')!;

      expect(old.providedSonames).toContain('libspdlog.so.1.15');
      expect(current.providedSonames).toContain('libspdlog.so.1.17');
      expect(current.providedSonames).not.toContain('libspdlog.so.1.15');
    });

    it('waybar IS broken when only spdlog 1.15 is the provider', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('spdlog-old'), scanJob('waybar')]);

      const waybar = Array.from(analysisRepo.store.values()).find((a) => a.version.includes('0.15.0'))!;
      const spdlogOld = Array.from(analysisRepo.store.values()).find((a) => a.version === '1.15.3-1')!;

      const broken = findBrokenDependencies({
        neededSonames: waybar.neededSonames,
        files: waybar.files,
        providedSonames: new Set(spdlogOld.providedSonames),
        checkSonames: true,
      });

      const spdlogBreak = broken
        .filter((b) => b.kind === 'soname')
        .map((b) => (b as { soname: string }).soname)
        .filter((s) => s.includes('spdlog'));

      expect(spdlogBreak).toContain('libspdlog.so.1.17');
    });

    it('waybar is NOT broken when spdlog 1.17 + fmt 12 are both providers', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('spdlog-new'), scanJob('fmt-new'), scanJob('waybar')]);

      const waybar = Array.from(analysisRepo.store.values()).find((a) => a.version.includes('0.15.0'))!;
      const spdlogNew = Array.from(analysisRepo.store.values()).find((a) => a.version === '1.17.0-1')!;
      const fmtNew = Array.from(analysisRepo.store.values()).find((a) => a.version === '12.0.0-1')!;

      const provided = new Set([...spdlogNew.providedSonames, ...fmtNew.providedSonames]);
      const broken = findBrokenDependencies({
        neededSonames: waybar.neededSonames,
        files: waybar.files,
        providedSonames: provided,
        checkSonames: true,
      });

      const vendorBreaks = broken
        .filter((b) => b.kind === 'soname')
        .map((b) => (b as { soname: string }).soname)
        .filter((s) => s.includes('fmt') || s.includes('spdlog'));

      expect(vendorBreaks).toEqual([]);
    });
  });

  describe('vendor rebuild trigger: stale runtime directories (python/perl/ruby)', () => {
    it('autojump ships under python3.14/site-packages', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('autojump')]);

      const autojump = Array.from(analysisRepo.store.values()).find((a) => a.version === '22.5.3-11.1')!;
      expect(autojump.files.some((f) => f.includes('usr/lib/python3.14/'))).toBe(true);
    });

    it('autojump is NOT stale when runtime is python 3.14 (matches)', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('autojump')]);

      const autojump = Array.from(analysisRepo.store.values()).find((a) => a.version === '22.5.3-11.1')!;
      const broken = findBrokenDependencies({
        neededSonames: autojump.neededSonames,
        files: autojump.files,
        providedSonames: new Set(),
        runtimes: { python: '3.14.3' },
        checkSonames: false,
      });

      const runtimeBreaks = broken.filter((b) => b.kind === 'runtime');
      expect(runtimeBreaks).toEqual([]);
    });

    it('autojump IS stale when runtime bumped to python 3.15 → triggers rebuild', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('autojump')]);

      const autojump = Array.from(analysisRepo.store.values()).find((a) => a.version === '22.5.3-11.1')!;
      const broken = findBrokenDependencies({
        neededSonames: autojump.neededSonames,
        files: autojump.files,
        providedSonames: new Set(),
        runtimes: { python: '3.15.0' },
        checkSonames: false,
      });

      const runtimeBreaks = broken.filter((b) => b.kind === 'runtime');
      expect(runtimeBreaks.length).toBeGreaterThan(0);
      const reasons = runtimeBreaks.map(formatBrokenDependency);
      expect(reasons.some((r) => r.includes('python3.14') && r.includes('3.15'))).toBe(true);
    });

    it('perl-authen-pam IS stale when perl bumps 5.42 → 5.43', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('perl-pam')]);

      const pkg = Array.from(analysisRepo.store.values()).find((a) => a.version === '0.16-14.3')!;
      expect(pkg.files.some((f) => f.includes('perl5/5.42/'))).toBe(true);

      const broken = findBrokenDependencies({
        neededSonames: pkg.neededSonames,
        files: pkg.files,
        providedSonames: new Set(),
        runtimes: { perl: '5.43.0' },
        checkSonames: false,
      });

      const reasons = broken.filter((b) => b.kind === 'runtime').map(formatBrokenDependency);
      expect(reasons.some((r) => r.includes('perl') && r.includes('5.43'))).toBe(true);
    });

    it('ruby-fusuma IS stale when ruby bumps 3.4.0 → 3.5.0', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('ruby-fusuma')]);

      const pkg = Array.from(analysisRepo.store.values()).find((a) => a.version === '1.4.2-1')!;
      expect(pkg.files.some((f) => f.includes('ruby/gems/3.4.0'))).toBe(true);

      const broken = findBrokenDependencies({
        neededSonames: pkg.neededSonames,
        files: pkg.files,
        providedSonames: new Set(),
        runtimes: { ruby: '3.5.0' },
        checkSonames: false,
      });

      const reasons = broken.filter((b) => b.kind === 'runtime').map(formatBrokenDependency);
      expect(reasons.some((r) => r.includes('ruby') && r.includes('3.5'))).toBe(true);
    });

    it('runtime staleness is NOT triggered when version matches', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('perl-pam'), scanJob('ruby-fusuma')]);

      const perlPkg = Array.from(analysisRepo.store.values()).find((a) => a.version === '0.16-14.3')!;
      const rubyPkg = Array.from(analysisRepo.store.values()).find((a) => a.version === '1.4.2-1')!;

      for (const pkg of [perlPkg, rubyPkg]) {
        const broken = findBrokenDependencies({
          neededSonames: pkg.neededSonames,
          files: pkg.files,
          providedSonames: new Set(),
          runtimes: { perl: '5.42.0', ruby: '3.4.0' },
          checkSonames: false,
        });
        expect(broken.filter((b) => b.kind === 'runtime')).toEqual([]);
      }
    });
  });

  describe('vendor rebuild trigger: GHC runtime dirs + versioned sonames (haskell ecosystem)', () => {
    it('haskell-strict-concurrency ships under usr/lib/ghc-9.6.6/', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('haskell-strict-concurrency')]);

      const pkg = Array.from(analysisRepo.store.values()).find((a) => a.version === '0.2.4.3-1')!;
      expect(pkg.files.some((f) => f.includes('usr/lib/ghc-9.6.6/'))).toBe(true);
    });

    it('provides a GHC-version-pinned soname', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('haskell-strict-concurrency')]);

      const pkg = Array.from(analysisRepo.store.values()).find((a) => a.version === '0.2.4.3-1')!;
      expect(pkg.providedSonames).toContain('libHSstrict-concurrency-0.2.4.3-tAwULt7um46FGRQhsBra7-ghc9.6.6.so');
    });

    it('haskell-strict-concurrency IS stale when ghc bumps 9.6.6 → 9.8 → triggers rebuild', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('haskell-strict-concurrency')]);

      const pkg = Array.from(analysisRepo.store.values()).find((a) => a.version === '0.2.4.3-1')!;
      const broken = findBrokenDependencies({
        neededSonames: pkg.neededSonames,
        files: pkg.files,
        providedSonames: new Set(),
        runtimes: { ghc: '9.8.2' },
        checkSonames: false,
      });

      const reasons = broken.filter((b) => b.kind === 'runtime').map(formatBrokenDependency);
      expect(reasons.some((r) => r.includes('ghc') && r.includes('9.6.6') && r.includes('9.8'))).toBe(true);
    });

    it('haskell-strict-concurrency is NOT stale when ghc matches (9.6.6)', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('haskell-strict-concurrency')]);

      const pkg = Array.from(analysisRepo.store.values()).find((a) => a.version === '0.2.4.3-1')!;
      const broken = findBrokenDependencies({
        neededSonames: pkg.neededSonames,
        files: pkg.files,
        providedSonames: new Set(),
        runtimes: { ghc: '9.6.6' },
        checkSonames: false,
      });
      expect(broken.filter((b) => b.kind === 'runtime')).toEqual([]);
    });
  });

  describe('recomputeBroken end-to-end (runtime versions read from the Arch repo)', () => {
    it('flags autojump broken when the Arch python bumps to 3.15', async () => {
      const { service, analysisRepo, archPkgRepo } = createService();
      archPkgRepo.seed([{ id: 3001, pkgname: 'python', version: '3.15.1' } as ArchlinuxPackage]);
      await service.scanPackages([scanJob('autojump')]);

      await service.recomputeBroken();

      const autojump = Array.from(analysisRepo.store.values()).find((a) => a.version === '22.5.3-11.1')!;
      expect(autojump.broken).toBe(true);
      expect(autojump.brokenReasons.some((r) => r.includes('python3.14') && r.includes('3.15'))).toBe(true);
    });

    it('flags perl-authen-pam broken when the Arch perl bumps to 5.43', async () => {
      const { service, analysisRepo, archPkgRepo } = createService();
      archPkgRepo.seed([{ id: 3002, pkgname: 'perl', version: '5.43.2' } as ArchlinuxPackage]);
      await service.scanPackages([scanJob('perl-pam')]);

      await service.recomputeBroken();

      const pam = Array.from(analysisRepo.store.values()).find((a) => a.version === '0.16-14.3')!;
      expect(pam.broken).toBe(true);
      expect(pam.brokenReasons.some((r) => r.includes('perl5/5.42') && r.includes('5.43'))).toBe(true);
    });

    it('flags ruby-fusuma broken when the Arch ruby bumps to 3.5', async () => {
      const { service, analysisRepo, archPkgRepo } = createService();
      archPkgRepo.seed([{ id: 3003, pkgname: 'ruby', version: '3.5.0' } as ArchlinuxPackage]);
      await service.scanPackages([scanJob('ruby-fusuma')]);

      await service.recomputeBroken();

      const fusuma = Array.from(analysisRepo.store.values()).find((a) => a.version === '1.4.2-1')!;
      expect(fusuma.broken).toBe(true);
      expect(fusuma.brokenReasons.some((r) => r.includes('ruby/gems/3.4.0') && r.includes('3.5'))).toBe(true);
    });

    it('flags haskell-strict-concurrency broken when the Arch ghc bumps to 9.8', async () => {
      const { service, analysisRepo, archPkgRepo } = createService();
      archPkgRepo.seed([{ id: 3008, pkgname: 'ghc', version: '9.8.4' } as ArchlinuxPackage]);
      await service.scanPackages([scanJob('haskell-strict-concurrency')]);

      await service.recomputeBroken();

      const pkg = Array.from(analysisRepo.store.values()).find((a) => a.version === '0.2.4.3-1')!;
      expect(pkg.broken).toBe(true);
      expect(pkg.brokenReasons.some((r) => r.includes('ghc') && r.includes('9.6.6') && r.includes('9.8'))).toBe(true);
    });

    it('clears the broken flag when the runtime matches again', async () => {
      const { service, analysisRepo, archPkgRepo } = createService();
      archPkgRepo.seed([
        { id: 3004, pkgname: 'python', version: '3.14.3' } as ArchlinuxPackage,
        { id: 3005, pkgname: 'perl', version: '5.42.1' } as ArchlinuxPackage,
        { id: 3006, pkgname: 'ruby', version: '3.4.0' } as ArchlinuxPackage,
      ]);
      await service.scanPackages([scanJob('autojump'), scanJob('perl-pam'), scanJob('ruby-fusuma')]);

      await service.recomputeBroken();

      for (const a of analysisRepo.store.values()) {
        expect(a.broken).toBe(false);
        expect(a.brokenReasons).toEqual([]);
      }
    });

    it('leaves soname detection off when the provided-soname index is sparse', async () => {
      // MIN_PROVIDED_SONAMES gates the soname channel until a full-mirror scan
      // populated the index. With only a handful of fixtures, nothing is flagged
      // as a missing soname — only runtime-dir staleness runs.
      const { service, analysisRepo, archPkgRepo } = createService();
      archPkgRepo.seed([{ id: 3007, pkgname: 'python', version: '3.14.3' } as ArchlinuxPackage]);
      await service.scanPackages([scanJob('autojump'), scanJob('waybar'), scanJob('apollo')]);

      await service.recomputeBroken();

      for (const a of analysisRepo.store.values()) {
        const sonameReasons = a.brokenReasons.filter((r) => r.startsWith('missing soname'));
        expect(sonameReasons).toEqual([]);
      }
    });
  });

  describe('vendor rebuild trigger: bluespec-git GHC soname break (undetected by manual trigger)', () => {
    it('bluespec ships GHC-version-pinned executables under /opt (not /usr/lib/ghc-*)', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('bluespec')]);

      const bluespec = Array.from(analysisRepo.store.values()).find((a) => a.version.includes('r1127'))!;
      // It does not ship a ghc runtime dir of its own — it *consumes* the ABI.
      expect(bluespec.files.some((f) => f.includes('usr/lib/ghc-'))).toBe(false);
      expect(bluespec.files.some((f) => f.includes('opt/bluespec/bin/core/bsc'))).toBe(true);
    });

    it('bluespec links the haskell-strict-concurrency soname', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('bluespec')]);

      const bluespec = Array.from(analysisRepo.store.values()).find((a) => a.version.includes('r1127'))!;
      expect(bluespec.neededSonames).toContain('libHSstrict-concurrency-0.2.4.3-tAwULt7um46FGRQhsBra7-ghc9.6.6.so');
      // It also links the explicitly-triggered haskell packages.
      expect(bluespec.neededSonames).toContain('libHSold-time-1.1.1.0-9WWjmNUa02UkaP5dbkbXm-ghc9.6.6.so');
      expect(bluespec.neededSonames).toContain('libHSsyb-0.7.4-BzNZTTWYfk9HN4YOl0udkE-ghc9.6.6.so');
      expect(bluespec.neededSonames.length).toBeGreaterThan(30);
    });

    it('bluespec IS broken when strict-concurrency is not provided → triggers rebuild', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('bluespec')]);

      const bluespec = Array.from(analysisRepo.store.values()).find((a) => a.version.includes('r1127'))!;
      const broken = findBrokenDependencies({
        neededSonames: bluespec.neededSonames,
        files: bluespec.files,
        providedSonames: new Set(),
        checkSonames: true,
      });

      const sonames = broken.filter((b) => b.kind === 'soname').map((b) => (b as { soname: string }).soname);
      // The whole GHC 9.6.6 ABI it links is absent → everything GHC is missing.
      expect(sonames).toContain('libHSstrict-concurrency-0.2.4.3-tAwULt7um46FGRQhsBra7-ghc9.6.6.so');
      expect(sonames).toContain('libHSbase-4.18.2.1-ghc9.6.6.so');
      // Base system libs are exempt (libm, libgmp...) — not false-flagged.
      expect(sonames.some((s) => s === 'libm.so.6' || s === 'libc.so.6')).toBe(false);
    });

    it('bluespec is NOT broken for strict-concurrency when its provider is indexed', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('bluespec'), scanJob('haskell-strict-concurrency')]);

      const bluespec = Array.from(analysisRepo.store.values()).find((a) => a.version.includes('r1127'))!;
      const strictConc = Array.from(analysisRepo.store.values()).find((a) => a.version === '0.2.4.3-1')!;

      // Only the haskell-strict-concurrency soname is in the provided index;
      // the rest of the GHC 9.6.6 ABI (libHSbase etc.) is still absent here, so
      // those remain broken — but the one this package depends on (and which
      // the manual trigger omits) must resolve cleanly.
      const broken = findBrokenDependencies({
        neededSonames: bluespec.neededSonames,
        files: bluespec.files,
        providedSonames: new Set(strictConc.providedSonames),
        checkSonames: true,
      });

      const breakSonames = broken.filter((b) => b.kind === 'soname').map((b) => (b as { soname: string }).soname);
      expect(breakSonames).not.toContain('libHSstrict-concurrency-0.2.4.3-tAwULt7um46FGRQhsBra7-ghc9.6.6.so');
      // The un-modeled rest of the GHC ABI is still absent — expected.
      expect(breakSonames).toContain('libHSbase-4.18.2.1-ghc9.6.6.so');
    });
  });

  describe('vendor rebuild trigger: D compiler-ABI (liblphobos → gtkd, soname keyed to ldc)', () => {
    it('liblphobos provides the ldc-versioned D runtime sonames', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('liblphobos-new')]);

      const pkg = Array.from(analysisRepo.store.values()).find((a) => a.version.includes('1.42.0'))!;
      expect(pkg.providedSonames).toContain('libphobos2-ldc-shared.so.112');
      expect(pkg.providedSonames).toContain('libdruntime-ldc-shared.so.112');
    });

    it('gtkd links the D runtime sonames (real D consumer)', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('gtkd')]);

      const gtkd = Array.from(analysisRepo.store.values()).find((a) => a.version.includes('3.11.0'))!;
      expect(gtkd.neededSonames).toContain('libphobos2-ldc-shared.so.112');
      expect(gtkd.neededSonames).toContain('libdruntime-ldc-shared.so.112');
    });

    it('gtkd IS broken when the D runtime is absent → triggers rebuild', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('gtkd')]);

      const gtkd = Array.from(analysisRepo.store.values()).find((a) => a.version.includes('3.11.0'))!;
      const broken = findBrokenDependencies({
        neededSonames: gtkd.neededSonames,
        files: gtkd.files,
        providedSonames: new Set(),
        checkSonames: true,
      });

      const sonames = broken.filter((b) => b.kind === 'soname').map((b) => (b as { soname: string }).soname);
      expect(sonames).toContain('libphobos2-ldc-shared.so.112');
      expect(sonames).toContain('libdruntime-ldc-shared.so.112');
    });

    it('gtkd IS broken when only the OLD ldc ABI is provided (.88 vs .112) → compiler-keyed break', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('gtkd')]);

      const gtkd = Array.from(analysisRepo.store.values()).find((a) => a.version.includes('3.11.0'))!;
      // An older liblphobos built against LDC 2.0.88 ships .so.88 sonames;
      // gtkd links .so.112. The compiler bump breaks the link even though the
      // package name (liblphobos) never changed.
      const oldDAbi = new Set(['libphobos2-ldc-shared.so.88', 'libdruntime-ldc-shared.so.88']);
      const broken = findBrokenDependencies({
        neededSonames: gtkd.neededSonames,
        files: gtkd.files,
        providedSonames: oldDAbi,
        checkSonames: true,
      });

      const breakSonames = broken.filter((b) => b.kind === 'soname').map((b) => (b as { soname: string }).soname);
      expect(breakSonames).toContain('libphobos2-ldc-shared.so.112');
      expect(breakSonames).toContain('libdruntime-ldc-shared.so.112');
      // The .88 sonames themselves are provided — they must not be flagged.
      expect(breakSonames).not.toContain('libphobos2-ldc-shared.so.88');
    });

    it('gtkd is NOT broken when the matching ldc ABI (.112) is provided', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('liblphobos-new'), scanJob('gtkd')]);

      const gtkd = Array.from(analysisRepo.store.values()).find((a) => a.version.includes('3.11.0'))!;
      const phobos = Array.from(analysisRepo.store.values()).find((a) => a.version.includes('1.42.0'))!;

      const broken = findBrokenDependencies({
        neededSonames: gtkd.neededSonames,
        files: gtkd.files,
        providedSonames: new Set(phobos.providedSonames),
        checkSonames: true,
      });

      const breakSonames = broken.filter((b) => b.kind === 'soname').map((b) => (b as { soname: string }).soname);
      expect(breakSonames).not.toContain('libphobos2-ldc-shared.so.112');
      expect(breakSonames).not.toContain('libdruntime-ldc-shared.so.112');
    });
  });

  describe('vendor rebuild trigger: hypr git-chain (hyprutils-git → hyprlang-git)', () => {
    it('hyprlang-git links the versioned hyprutils soname', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('hyprlang-git')]);

      const hyprlang = Array.from(analysisRepo.store.values()).find((a) => a.version.includes('0.6.8'))!;
      expect(hyprlang.neededSonames).toContain('libhyprutils.so.13');
    });

    it('hyprutils-git provides libhyprutils.so.13', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('hyprutils-git')]);

      const hyprutils = Array.from(analysisRepo.store.values()).find((a) => a.version.includes('0.14.0'))!;
      expect(hyprutils.providedSonames).toContain('libhyprutils.so.13');
    });

    it('hyprlang-git IS broken when only an older SOVERSION is provided → triggers rebuild', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('hyprlang-git')]);

      const hyprlang = Array.from(analysisRepo.store.values()).find((a) => a.version.includes('0.6.8'))!;
      // When hyprutils bumps SOVERSION 13→14 (as it did 0.13→0.14), consumers
      // linking .so.13 break — the ELF channel flags the rebuild the manual
      // trigger is also configured for.
      const oldSoversion = new Set(['libhyprutils.so.12']);
      const broken = findBrokenDependencies({
        neededSonames: hyprlang.neededSonames,
        files: hyprlang.files,
        providedSonames: oldSoversion,
        checkSonames: true,
      });

      const breakSonames = broken.filter((b) => b.kind === 'soname').map((b) => (b as { soname: string }).soname);
      expect(breakSonames).toContain('libhyprutils.so.13');
    });

    it('hyprlang-git is NOT broken when hyprutils provides .so.13', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('hyprutils-git'), scanJob('hyprlang-git')]);

      const hyprlang = Array.from(analysisRepo.store.values()).find((a) => a.version.includes('0.6.8'))!;
      const hyprutils = Array.from(analysisRepo.store.values()).find((a) => a.version.includes('0.14.0'))!;

      const broken = findBrokenDependencies({
        neededSonames: hyprlang.neededSonames,
        files: hyprlang.files,
        providedSonames: new Set(hyprutils.providedSonames),
        checkSonames: true,
      });

      const breakSonames = broken.filter((b) => b.kind === 'soname').map((b) => (b as { soname: string }).soname);
      expect(breakSonames).not.toContain('libhyprutils.so.13');
    });
  });

  describe('vendor rebuild trigger: ffmpeg soname fan-out (aegisub)', () => {
    it('aegisub links ffmpeg sonames', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('aegisub')]);

      const aegisub = Array.from(analysisRepo.store.values()).find((a) => a.version.includes('12.r24'))!;
      expect(aegisub.neededSonames).toContain('libavcodec.so.63');
      expect(aegisub.neededSonames).toContain('libavutil.so.61');
      expect(aegisub.neededSonames).toContain('libavformat.so.63');
    });

    it('ffmpeg provides the versioned media sonames', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('ffmpeg')]);

      const ffmpeg = Array.from(analysisRepo.store.values()).find((a) => a.version.includes('9.0'))!;
      expect(ffmpeg.providedSonames).toContain('libavcodec.so.63');
      expect(ffmpeg.providedSonames).toContain('libavutil.so.61');
    });

    it('aegisub IS broken when an older ffmpeg ABI is provided (libavcodec.so.62)', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('aegisub')]);

      const aegisub = Array.from(analysisRepo.store.values()).find((a) => a.version.includes('12.r24'))!;
      // ffmpeg 8.x shipped libavcodec.so.62; aegisub links .63.
      const oldFfmpeg = new Set([
        'libavcodec.so.62',
        'libavutil.so.60',
        'libavformat.so.62',
        'libswresample.so.7',
        'libswscale.so.10',
        'libavfilter.so.12',
        'libavdevice.so.62',
      ]);
      const broken = findBrokenDependencies({
        neededSonames: aegisub.neededSonames,
        files: aegisub.files,
        providedSonames: oldFfmpeg,
        checkSonames: true,
      });

      const breakSonames = broken.filter((b) => b.kind === 'soname').map((b) => (b as { soname: string }).soname);
      expect(breakSonames).toContain('libavcodec.so.63');
      expect(breakSonames).toContain('libavutil.so.61');
    });

    it('aegisub is NOT broken when ffmpeg 9.0 is the provider', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('ffmpeg'), scanJob('aegisub')]);

      const aegisub = Array.from(analysisRepo.store.values()).find((a) => a.version.includes('12.r24'))!;
      const ffmpeg = Array.from(analysisRepo.store.values()).find((a) => a.version.includes('9.0'))!;

      const broken = findBrokenDependencies({
        neededSonames: aegisub.neededSonames,
        files: aegisub.files,
        providedSonames: new Set(ffmpeg.providedSonames),
        checkSonames: true,
      });

      const breakSonames = broken.filter((b) => b.kind === 'soname').map((b) => (b as { soname: string }).soname);
      expect(breakSonames).not.toContain('libavcodec.so.63');
      expect(breakSonames).not.toContain('libavutil.so.61');
    });
  });

  describe('content-only trigger: srb2-data (no ELF to diff)', () => {
    it('srb2 links libminiupnpc (the ELF-detectable half of its triggers)', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('srb2')]);

      const srb2 = Array.from(analysisRepo.store.values()).find((a) => a.version.includes('2.2.15'))!;
      expect(srb2.neededSonames).toContain('libminiupnpc.so.21');
    });

    it('srb2 has NO soname link to srb2-data (content is invisible to ELF)', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('srb2')]);

      const srb2 = Array.from(analysisRepo.store.values()).find((a) => a.version.includes('2.2.15'))!;
      // No NEEDED soname carries any data-package name.
      expect(srb2.neededSonames.some((s) => s.includes('srb2') || s.includes('data'))).toBe(false);
      // The ELF channel is silent here — the manual trigger is the only one
      // that can catch an srb2-data content swap.
    });
  });

  describe('dependency graph (cross-boundary soname edges)', () => {
    function buildGraph(
      repo: MockRepository<PackageElfAnalysis>,
      archPkgRepo: MockRepository<ArchlinuxPackage>,
      packageRepo: MockRepository<Package>,
    ): DependencyEdge[] {
      const analyses = Array.from(repo.store.values());
      const archPkgs = Array.from(archPkgRepo.store.values());
      const chaoticPkgs = Array.from(packageRepo.store.values());
      const nameById = new Map<string, string>();
      for (const pkg of archPkgs) nameById.set(`0:${pkg.id}`, pkg.pkgname);
      for (const pkg of chaoticPkgs) nameById.set(`1:${pkg.id}`, pkg.pkgname);

      const latest = latestAnalysisByKey(analyses, (analysis) => `${analysis.pkgType}:${analysis.pkgId}`);

      const nodes: DependencyNode[] = [...latest.values()].map((analysis) => ({
        pkgType: analysis.pkgType as '0' | '1',
        pkgId: analysis.pkgId,
        pkgname: nameById.get(`${analysis.pkgType}:${analysis.pkgId}`) ?? String(analysis.pkgId),
        providedSonames: analysis.providedSonames,
        neededSonames: analysis.neededSonames,
      }));

      return buildDependencyGraph(nodes);
    }

    it('better-blur → kwin edge appears in the dependency graph', async () => {
      const { service, analysisRepo, archPkgRepo, packageRepo } = createService();
      await service.scanPackages([scanJob('kwin-new'), scanJob('better-blur')]);

      const edges = buildGraph(analysisRepo, archPkgRepo, packageRepo);
      // There must be an edge where better-blur (consumer) depends on kwin (provider)
      // via libkwin.so.6.
      const kwinBlurEdge = edges.find((e) => e.soname === 'libkwin.so.6');
      expect(kwinBlurEdge).toBeDefined();
      expect(kwinBlurEdge!.consumer.pkgname).toBe('kwin-effects-better-blur-dx');
      expect(kwinBlurEdge?.provider.pkgname).toBe('kwin');
    });

    it('apollo → boost-libs edge appears in the dependency graph', async () => {
      const { service, analysisRepo, archPkgRepo, packageRepo } = createService();
      await service.scanPackages([scanJob('boost-new'), scanJob('apollo')]);

      const edges = buildGraph(analysisRepo, archPkgRepo, packageRepo);
      const boostEdge = edges.find((e) => e.soname.includes('libboost'));
      expect(boostEdge).toBeDefined();
      expect(boostEdge!.provider.pkgname).toBe('boost-libs');
    });

    it('dependency graph edges cross the Arch/Chaotic boundary', async () => {
      const { service, analysisRepo, archPkgRepo, packageRepo } = createService();
      await service.scanPackages([scanJob('kwin-new'), scanJob('better-blur')]);

      const edges = buildGraph(analysisRepo, archPkgRepo, packageRepo);
      const boundaryEdges = edges.filter((e) => e.consumer.pkgType !== e.provider.pkgType);
      expect(boundaryEdges.length).toBeGreaterThan(0);
      // better-blur is Chaotic ('1'), kwin is Arch ('0').
      expect(boundaryEdges[0].consumer.pkgType).toBe('1');
      expect(boundaryEdges[0].provider.pkgType).toBe('0');
    });
  });

  describe('executable ELF scanning (DT_NEEDED of binaries, not just .so)', () => {
    it('apollo binary contributes DT_NEEDED to the analysis', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('apollo')]);

      const apollo = Array.from(analysisRepo.store.values()).find((a) => a.version.includes('0.4.8'))!;
      // These sonames come from the binary, not a .so — confirms executable scanning works.
      expect(apollo.neededSonames).toContain('libcurl.so.4');
      expect(apollo.neededSonames).toContain('libgtk-3.so.0');
      expect(apollo.neededSonames).toContain('libssl.so.3');
    });

    it('apollo has no providedSonames (it is a pure executable, not a library)', async () => {
      const { service, analysisRepo } = createService();
      await service.scanPackages([scanJob('apollo')]);

      const apollo = Array.from(analysisRepo.store.values()).find((a) => a.version.includes('0.4.8'))!;
      expect(apollo.providedSonames).toEqual([]);
    });
  });

  describe('seed import', () => {
    const seedEntry = (pkgname: string, id: number, dir: string): Record<string, unknown> => ({
      pkgType: '0',
      pkgname,
      version: '1.0-1',
      files: [`${dir}/lib${pkgname}.so`],
      neededSonames: pkgname === 'plugin' ? ['libowner.so.1'] : [],
      providedSonames: pkgname === 'owner' ? ['libowner.so.1'] : [],
      importedSymbols: [],
      exportedSymbols: {},
      vtables: {},
      directoriesOwned: [dir],
      directDirectories: [dir],
      pluginOf: [],
      broken: false,
      brokenReasons: [],
    });

    it('resolves pkgname entries to database pkgIds and derives pluginOf', async () => {
      const { seedService, analysisRepo, archPkgRepo } = createService();
      archPkgRepo.seed([
        { id: 10, pkgname: 'owner', version: '1.0-1' } as ArchlinuxPackage,
        { id: 11, pkgname: 'plugin', version: '1.0-1' } as ArchlinuxPackage,
      ]);
      const archRowCount = archPkgRepo.store.size;

      await seedService.importSeed([
        seedEntry('owner', 10, 'usr/lib/owner'),
        seedEntry('plugin', 11, 'usr/lib/owner'),
      ] as unknown[]);

      // Analyses are keyed by the resolved database ids, not the seed identity.
      const owner = Array.from(analysisRepo.store.values()).find((a) => a.pkgId === 10)!;
      const plugin = Array.from(analysisRepo.store.values()).find((a) => a.pkgId === 11)!;
      expect(owner).toBeDefined();
      expect(plugin).toBeDefined();

      // plugin writes into owner's directory -> its pluginOf carries the owner key.
      expect(plugin.pluginOf).toContain('a10');
      // No new arch rows were created (both already existed).
      expect(archPkgRepo.store.size).toBe(archRowCount);
    });

    it('keeps numeric pkgId entries working (backend-exported seeds)', async () => {
      const { seedService, analysisRepo } = createService();
      await seedService.importSeed([
        {
          pkgType: '0',
          pkgId: 99,
          version: '3.2.1-1',
          files: ['usr/lib/libx.so.1'],
          neededSonames: [],
          providedSonames: ['libx.so.1'],
          importedSymbols: [],
          exportedSymbols: {},
          vtables: {},
          directoriesOwned: ['usr/lib/libx.so.1'],
          directDirectories: ['usr/lib'],
          pluginOf: [],
          broken: false,
          brokenReasons: [],
        },
      ] as unknown[]);

      const analysis = Array.from(analysisRepo.store.values()).find((a) => a.pkgId === 99)!;
      expect(analysis.version).toBe('3.2.1-1');
    });

    it('imports a newline-delimited JSON seed file (offline indexer output)', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'seed-import-'));
      const path = join(dir, 'seed.ndjson');
      try {
        const ownerRow: ArchlinuxPackage = { id: 10, pkgname: 'owner', version: '1.0-1' } as ArchlinuxPackage;
        const pluginRow: ArchlinuxPackage = { id: 11, pkgname: 'plugin', version: '1.0-1' } as ArchlinuxPackage;
        const { seedService, analysisRepo, archPkgRepo } = createService();
        archPkgRepo.seed([ownerRow, pluginRow]);

        const line = (id: number, name: string, dirs: string[]): string =>
          JSON.stringify({
            pkgType: '0',
            pkgId: id,
            pkgname: name,
            version: '1.0-1',
            files: dirs.map((d) => `${d}/lib${name}.so`),
            neededSonames: name === 'plugin' ? ['libowner.so.1'] : [],
            providedSonames: name === 'owner' ? ['libowner.so.1'] : [],
            importedSymbols: [],
            exportedSymbols: {},
            vtables: {},
            directoriesOwned: dirs,
            directDirectories: dirs,
            pluginOf: [],
            broken: false,
            brokenReasons: [],
          });

        await writeFile(path, `${line(10, 'owner', ['usr/lib/owner'])}\n${line(11, 'plugin', ['usr/lib/owner'])}\n`);
        await seedService.importSeedFile(path);

        const owner = Array.from(analysisRepo.store.values()).find((a) => a.pkgId === 10)!;
        const plugin = Array.from(analysisRepo.store.values()).find((a) => a.pkgId === 11)!;
        expect(owner).toBeDefined();
        expect(plugin).toBeDefined();
        expect(plugin.pluginOf).toContain('a10');
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });
});
