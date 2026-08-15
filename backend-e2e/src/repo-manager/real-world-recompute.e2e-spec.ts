import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createE2eApp, type E2eApp } from '../test/e2e-app';
import { SignalScanService } from '@chaotic-next/backend/repo-manager/scan';
import {
  ARCH_PKG_TYPE,
  CHAOTIC_PKG_TYPE,
  encodeOwnerKey,
  MIN_PROVIDED_SONAMES,
  pkgTypeOf,
} from '@chaotic-next/backend/repo-manager/signal';
import { TriggerType } from '@chaotic-next/backend/interfaces/repo-manager';
import {
  REAL_ARCH_PROVIDERS,
  REAL_CHAOTIC_CONSUMERS,
  REAL_CHAOTIC_PROVIDERS,
  REAL_PROVIDED_SONAME_COUNT,
} from './real-world.fixtures';

interface SeedEntry {
  pkgType: string;
  pkgname: string;
  repo?: string;
  version: string;
  files: string[];
  neededSonames: string[];
  providedSonames: string[];
  importedSymbols: string[];
  exportedSymbols: Record<string, string[]>;
  vtables: Record<string, string[]>;
  directoriesOwned: string[];
  directDirectories: string[];
  pluginOf: string[];
}

/** One entry of the GET /repo/broken response. */
type BrokenEntry = { pkgname: string; reasons?: string[] };

/** One entry of the GET /repo/dependencies response. */
type Edge = { consumer: { pkgname: string }; provider: { pkgname: string }; soname: string };

function archSeed(
  pkgname: string,
  version: string,
  providedSonames: string[],
  neededSonames: string[],
  dirs?: { directoriesOwned?: string[]; directDirectories?: string[]; files?: string[] },
): SeedEntry {
  return {
    pkgType: pkgTypeOf(TriggerType.ARCH),
    pkgname,
    version,
    files: dirs?.files ?? providedSonames.map((s) => `usr/lib/${s}`),
    neededSonames,
    providedSonames,
    importedSymbols: [],
    exportedSymbols: {},
    vtables: {},
    directoriesOwned: dirs?.directoriesOwned ?? ['usr/lib'],
    directDirectories: dirs?.directDirectories ?? ['usr/lib'],
    pluginOf: [],
  };
}

function chaoticSeed(
  pkgname: string,
  version: string,
  neededSonames: string[],
  providedSonames: string[],
  files?: string[],
): SeedEntry {
  return {
    pkgType: pkgTypeOf(TriggerType.CHAOTIC),
    pkgname,
    repo: 'chaotic-aur',
    version,
    files: files ?? [`usr/bin/${pkgname}`],
    neededSonames,
    providedSonames,
    importedSymbols: [],
    exportedSymbols: {},
    vtables: {},
    directoriesOwned: ['usr/bin'],
    directDirectories: ['usr/bin'],
    pluginOf: [],
  };
}

function realSeed(overrides?: { tclProvided?: string[] }): SeedEntry[] {
  return [
    ...REAL_ARCH_PROVIDERS.filter((p) => p.pkgname !== 'tcl').map((p) =>
      archSeed(p.pkgname, p.version, p.providedSonames, p.neededSonames),
    ),
    archSeed('tcl', '8.6.16', overrides?.tclProvided ?? ['libtcl8.6.so'], ['libc.so.6', 'libm.so.6', 'libz.so.1']),
    ...REAL_CHAOTIC_PROVIDERS.map((p) => chaoticSeed(p.pkgname, p.version, p.neededSonames, p.providedSonames)),
    ...REAL_CHAOTIC_CONSUMERS.map((c) => chaoticSeed(c.pkgname, c.version, c.neededSonames, c.providedSonames)),
  ];
}

function kwinPluginSeed(): SeedEntry[] {
  const providers = REAL_ARCH_PROVIDERS.map((p) =>
    p.pkgname === 'kwin'
      ? archSeed(p.pkgname, p.version, p.providedSonames, p.neededSonames, {
          files: [
            'usr/lib/qt6/plugins/kwin/effects/configs/kwin_blur_config.so',
            'usr/lib/qt6/plugins/kwin/effects/configs/kwin_slide_config.so',
          ],
          directoriesOwned: [
            'usr/lib/qt6/plugins/kwin',
            'usr/lib/qt6/plugins/kwin/effects',
            'usr/lib/qt6/plugins/kwin/effects/configs',
          ],
          directDirectories: ['usr/lib/qt6/plugins/kwin/effects/configs'],
        })
      : archSeed(p.pkgname, p.version, p.providedSonames, p.neededSonames),
  );
  const consumers = [
    ...REAL_CHAOTIC_PROVIDERS.map((p) => chaoticSeed(p.pkgname, p.version, p.neededSonames, p.providedSonames)),
    ...REAL_CHAOTIC_CONSUMERS.filter((c) => c.pkgname !== 'kwin-effects-better-blur-dx').map((c) =>
      chaoticSeed(c.pkgname, c.version, c.neededSonames, c.providedSonames),
    ),
  ];
  const betterBlur = REAL_CHAOTIC_CONSUMERS.find((c) => c.pkgname === 'kwin-effects-better-blur-dx');
  if (!betterBlur) throw new Error('missing better-blur fixture');
  consumers.push(
    chaoticSeed(betterBlur.pkgname, betterBlur.version, betterBlur.neededSonames, betterBlur.providedSonames, [
      'usr/lib/qt6/plugins/kwin/effects/configs/kwin_better_blur_dx_config.so',
      'usr/lib/qt6/plugins/kwin/effects/plugins/better_blur_dx.so',
    ]),
  );
  return [...providers, ...consumers];
}

describe('Real-world broken recompute + dependency graph (e2e, real PostgreSQL)', () => {
  let e2e: E2eApp;
  let signalScan: SignalScanService;

  const importSeed = async (payload: SeedEntry[]): Promise<void> => {
    const res = await e2e.inject({ method: 'POST', url: '/repo/signals/import', payload });
    expect(res.statusCode).toBe(201);
  };

  const fetchBroken = async (): Promise<BrokenEntry[]> => {
    const res = await e2e.inject<BrokenEntry[]>({ method: 'GET', url: '/repo/broken' });
    expect(res.statusCode).toBe(200);
    return await res.json();
  };

  const brokenPkgnames = async (): Promise<string[]> => (await fetchBroken()).map((entry) => entry.pkgname);

  const fetchEdges = async (url = '/repo/dependencies'): Promise<Edge[]> => {
    const res = await e2e.inject<Edge[]>({ method: 'GET', url });
    expect(res.statusCode).toBe(200);
    return await res.json();
  };

  beforeAll(async () => {
    e2e = await createE2eApp();
    signalScan = e2e.app.get(SignalScanService);
  });

  afterAll(async () => {
    await e2e?.close();
  });

  beforeEach(async () => {
    await e2e.resetTables();
  });

  describe('POST /repo/signals/import with real-world fixtures', () => {
    it('imports real Arch providers and Chaotic consumers and persists them', async () => {
      await importSeed(realSeed());

      const archRows = (await e2e.dataSource.query(
        `SELECT COUNT(*)::int AS count FROM package_elf_analysis WHERE "pkgType" = $1`,
        [ARCH_PKG_TYPE],
      )) as Array<{ count: number }>;
      expect(archRows).toHaveLength(1);
      expect(archRows[0].count).toBe(REAL_ARCH_PROVIDERS.length);

      const chaoticRows = (await e2e.dataSource.query(
        `SELECT COUNT(*)::int AS count FROM package_elf_analysis WHERE "pkgType" = $1`,
        [CHAOTIC_PKG_TYPE],
      )) as Array<{ count: number }>;
      expect(chaoticRows).toHaveLength(1);
      expect(chaoticRows[0].count).toBe(REAL_CHAOTIC_CONSUMERS.length + REAL_CHAOTIC_PROVIDERS.length);
    });
  });

  describe('recompute broken against real-world data', () => {
    it('provides >= MIN_PROVIDED_SONAMES so soname checking runs', () => {
      expect(REAL_PROVIDED_SONAME_COUNT).toBeGreaterThanOrEqual(MIN_PROVIDED_SONAMES);
    });

    it('no-SONAME provider basename satisfies the consumer (scid/tcl)', async () => {
      await importSeed(realSeed());
      expect(await brokenPkgnames()).not.toContain('scid');
    });

    it('xorgxrdp-glamor is satisfied by xorg-server no-SONAME basename', async () => {
      await importSeed(realSeed());
      expect(await brokenPkgnames()).not.toContain('xorgxrdp-glamor');
    });

    it('flags tio broken (lua 5.5 dropped liblua.so.5.4)', async () => {
      await importSeed(realSeed());

      const tio = (await fetchBroken()).find((entry) => entry.pkgname === 'tio');
      expect(tio).toBeDefined();
      expect(tio?.reasons).toContain('missing soname liblua.so.5.4');
    });

    it('bluespec-git is satisfied by ghc-libs, gmp, numactl, libffi and tcl', async () => {
      await importSeed(realSeed());
      expect(await brokenPkgnames()).not.toContain('bluespec-git');
    });

    it('kwin-effects-better-blur-dx is satisfied by the KDE/Qt stack', async () => {
      await importSeed(realSeed());
      expect(await brokenPkgnames()).not.toContain('kwin-effects-better-blur-dx');
    });

    it('clears a false positive after the provider is rescanned (prev/after an update)', async () => {
      // "Prev": tcl scanned without recording its no-SONAME basename, so scid
      // links libtcl8.6.so that nobody provides.
      await importSeed(realSeed({ tclProvided: [] }));
      await signalScan.recomputeBroken();
      expect(await brokenPkgnames()).toContain('scid');

      // "After": tcl is rescanned (post-fix) and now records libtcl8.6.so.
      // scanPackages() upserts the same (pkgType, pkgId, version) key, so we
      // overwrite the row in place rather than importing (imports skip rows
      // whose version already exists).
      await e2e.dataSource.query(
        `UPDATE package_elf_analysis
           SET "providedSonames" = $1::jsonb
           WHERE "pkgType" = $2 AND "pkgId" = (
             SELECT id FROM archlinux_package WHERE pkgname = 'tcl'
           )`,
        [JSON.stringify(['libtcl8.6.so']), ARCH_PKG_TYPE],
      );
      await signalScan.recomputeBroken();
      expect(await brokenPkgnames()).not.toContain('scid');
    });
  });

  describe('GET /repo/dependencies with real-world fixtures', () => {
    it('returns real edges (scid -> tcl via libtcl8.6.so, xorgxrdp-glamor -> xorg-server)', async () => {
      await importSeed(realSeed());

      const edges = await fetchEdges();
      expect(
        edges.find((e) => e.soname === 'libtcl8.6.so' && e.consumer.pkgname === 'scid' && e.provider.pkgname === 'tcl'),
      ).toBeDefined();
      expect(
        edges.find(
          (e) =>
            e.soname === 'libglamoregl.so' &&
            e.consumer.pkgname === 'xorgxrdp-glamor' &&
            e.provider.pkgname === 'xorg-server',
        ),
      ).toBeDefined();
    });

    it('returns edges for bluespec-git (tcl, ghc-libs) and better-blur (kwin)', async () => {
      await importSeed(realSeed());

      const edges = await fetchEdges();
      expect(
        edges.find(
          (e) => e.soname === 'libtcl8.6.so' && e.consumer.pkgname === 'bluespec-git' && e.provider.pkgname === 'tcl',
        ),
      ).toBeDefined();
      expect(
        edges.find(
          (e) =>
            e.soname === 'libHSbase-4.18.2.1-ghc9.6.6.so' &&
            e.consumer.pkgname === 'bluespec-git' &&
            e.provider.pkgname === 'ghc-libs',
        ),
      ).toBeDefined();
      expect(
        edges.find(
          (e) =>
            e.soname === 'libkwin.so.6' &&
            e.consumer.pkgname === 'kwin-effects-better-blur-dx' &&
            e.provider.pkgname === 'kwin',
        ),
      ).toBeDefined();
    });

    it('marks better-blur as a plugin of kwin (Qt plugin-namespace rule)', async () => {
      await importSeed(kwinPluginSeed());

      const rows = (await e2e.dataSource.query(
        `SELECT a."pluginOf"
           FROM package_elf_analysis a
           JOIN package p ON p.id = a."pkgId" AND a."pkgType" = $1
           WHERE p.pkgname = 'kwin-effects-better-blur-dx'`,
        [CHAOTIC_PKG_TYPE],
      )) as Array<{ pluginOf: string[] }>;
      expect(rows).toHaveLength(1);
      expect(rows[0].pluginOf.length).toBeGreaterThan(0);

      const kwinRow = (await e2e.dataSource.query(`SELECT id FROM archlinux_package WHERE pkgname = 'kwin'`)) as Array<{
        id: number;
      }>;
      expect(kwinRow).toHaveLength(1);
      expect(rows[0].pluginOf).toContain(encodeOwnerKey(TriggerType.ARCH, kwinRow[0].id));
    });

    it('lists what would trigger a rebuild of scid (soname providers, no broken deps)', async () => {
      await importSeed(realSeed());

      type ReportType = {
        pkgname: string;
        explicitTriggers: { pkgname: string; archVersion: string }[];
        sonameDependencies: { soname: string; providers: { pkgname: string; pkgType: string }[] }[];
        pluginOwners: { pkgname: string; pkgType: string }[];
      };
      const res = await e2e.inject<ReportType>({ method: 'GET', url: '/repo/dependencies/scid' });
      expect(res.statusCode).toBe(200);
      const report = await res.json();
      expect(report.pkgname).toBe('scid');
      expect(
        report.sonameDependencies.find(
          (dep) =>
            dep.soname === 'libtcl8.6.so' &&
            dep.providers.some((provider) => provider.pkgname === 'tcl' && provider.pkgType === 'arch'),
        ),
      ).toBeDefined();
    });

    it('returns 404 for an unknown package', async () => {
      await importSeed(realSeed());
      const res = await e2e.inject({ method: 'GET', url: '/repo/dependencies/does-not-exist' });
      expect(res.statusCode).toBe(404);
    });

    it('gates soname providers to declared deps: non-dependency providers are dropped', async () => {
      await importSeed(realSeed());

      // better-blur links libkwin.so.6 (kwin) and libKF6KCMUtils.so.6
      // (kcmutils). With only kwin declared as a dependency, only kwin should
      // remain as a provider; kcmutils' soname entry must disappear entirely.
      await e2e.dataSource.query(
        `UPDATE package SET metadata = $1::jsonb WHERE pkgname = 'kwin-effects-better-blur-dx'`,
        [JSON.stringify({ deps: ['kwin'] })],
      );

      type SonameReportType = {
        sonameDependencies: { soname: string; providers: { pkgname: string }[] }[];
        pluginOwners: { pkgname: string }[];
      };
      const res = await e2e.inject<SonameReportType>({
        method: 'GET',
        url: '/repo/dependencies/kwin-effects-better-blur-dx',
      });
      expect(res.statusCode).toBe(200);
      const report = await res.json();

      const kwinDep = report.sonameDependencies.find((dep) => dep.soname === 'libkwin.so.6');
      expect(kwinDep?.providers.map((provider) => provider.pkgname)).toEqual(['kwin']);
      expect(report.sonameDependencies.find((dep) => dep.soname === 'libKF6KCMUtils.so.6')).toBeUndefined();
      expect(report.sonameDependencies.every((dep) => dep.providers.length > 0)).toBe(true);
    });

    it('gates plugin owners to declared deps and excludes the package itself', async () => {
      await importSeed(kwinPluginSeed());

      const self = (await e2e.dataSource.query(
        `SELECT id FROM package WHERE pkgname = 'kwin-effects-better-blur-dx'`,
      )) as Array<{ id: number }>;
      expect(self).toHaveLength(1);
      const nonDep = (await e2e.dataSource.query(
        `SELECT id FROM archlinux_package WHERE pkgname = 'kcmutils'`,
      )) as Array<{ id: number }>;
      expect(nonDep).toHaveLength(1);

      const extraOwners = [
        encodeOwnerKey(TriggerType.CHAOTIC, self[0].id),
        encodeOwnerKey(TriggerType.ARCH, nonDep[0].id),
      ];
      await e2e.dataSource.query(
        `UPDATE package_elf_analysis
            SET "pluginOf" = "pluginOf" || $2::jsonb
            WHERE "pkgType" = $1 AND "pkgId" = $3`,
        [CHAOTIC_PKG_TYPE, JSON.stringify(extraOwners), self[0].id],
      );

      // Declare kwin as the only dependency: it must stay, kcmutils (a
      // non-dependency) and the package itself must be dropped.
      await e2e.dataSource.query(
        `UPDATE package SET metadata = $1::jsonb WHERE pkgname = 'kwin-effects-better-blur-dx'`,
        [JSON.stringify({ deps: ['kwin'] })],
      );

      type PluginReportType = {
        pluginOwners: { pkgname: string; pkgType: string }[];
      };
      const res = await e2e.inject<PluginReportType>({
        method: 'GET',
        url: '/repo/dependencies/kwin-effects-better-blur-dx',
      });
      expect(res.statusCode).toBe(200);
      const report = await res.json();

      const owners = report.pluginOwners.map((owner) => owner.pkgname);
      expect(owners).toEqual(['kwin']);
      expect(owners).not.toContain('kcmutils');
      expect(owners).not.toContain('kwin-effects-better-blur-dx');
    });
  });
});
