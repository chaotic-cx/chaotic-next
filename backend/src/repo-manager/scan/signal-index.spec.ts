import { describe, expect, it, vi } from 'vitest';
import { Package } from '../../builder/builder.entity';
import { TriggerType } from '../../interfaces/repo-manager';
import { ArchlinuxPackage, PackageElfAnalysis } from '../repo-manager.entity';
import { createMockRepository } from '../test/mock-repository';
import { SignalIndex } from './signal-index';

const logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };

function analysis(overrides: Partial<PackageElfAnalysis>): PackageElfAnalysis {
  return {
    id: overrides.pkgId,
    pkgType: '1',
    version: '1.0-1',
    files: [],
    neededSonames: [],
    providedSonames: [],
    importedSymbols: [],
    exportedSymbols: {},
    providedVersionNodes: {},
    neededVersionNodes: {},
    vtables: {},
    directoriesOwned: [],
    directDirectories: [],
    pluginOf: [],
    broken: false,
    brokenReasons: [],
    brokenSince: null,
    isSourceCompiled: true,
    scannedAt: new Date('2026-09-01T00:00:00Z'),
    ...overrides,
  } as PackageElfAnalysis;
}

function createIndex() {
  const analyses = createMockRepository<PackageElfAnalysis>({ keyOf: (a) => `${a.pkgType}|${a.pkgId}|${a.version}` });
  const archPackages = createMockRepository<ArchlinuxPackage>({ keyOf: (p) => String(p.id) });
  const packages = createMockRepository<Package>({ keyOf: (p) => String(p.id) });
  archPackages.seed([
    { id: 1, pkgname: 'python', version: '3.13.1', deactivatedAt: null } as ArchlinuxPackage,
    { id: 42, pkgname: 'kwin', version: '6.7.0', deactivatedAt: null } as ArchlinuxPackage,
  ]);
  const index = new SignalIndex(analyses, archPackages, packages, logger);
  return { index, analyses, packages };
}

describe('SignalIndex.refreshAfterScan — plugin owners with files loaded on demand', () => {
  const kwinDir = 'usr/lib/qt6/plugins/kwin/effects/configs';

  it('flags a plugin of kwin, but not a fork that ships a file of kwin', async () => {
    const { index, analyses, packages } = createIndex();
    packages.seed([
      { id: 7, pkgname: 'kwin-effects-blur', isActive: true } as Package,
      { id: 8, pkgname: 'kwin-blur-fork', isActive: true } as Package,
    ]);
    analyses.seed([
      analysis({
        pkgType: '0',
        pkgId: 42,
        version: '6.7.0',
        directDirectories: [kwinDir],
        directoriesOwned: [kwinDir],
        files: [`${kwinDir}/kwin_blur_config.so`],
      }),
      analysis({ pkgId: 7, files: [`${kwinDir}/blur_dx_config.so`], neededSonames: ['libkwin.so.6'] }),
      analysis({
        pkgId: 8,
        files: [`${kwinDir}/kwin_blur_config.so`, `${kwinDir}/extra_config.so`],
        neededSonames: ['libkwin.so.6'],
      }),
    ]);

    await index.refreshAfterScan([
      { pkgType: TriggerType.CHAOTIC, pkgId: 7, version: '1.0-1', hasCompiledCode: true, isSourceCompiled: true },
      { pkgType: TriggerType.CHAOTIC, pkgId: 8, version: '1.0-1', hasCompiledCode: true, isSourceCompiled: true },
    ]);

    expect(analyses.store.get('1|7|1.0-1')?.pluginOf).toEqual(['a42']);
    expect(analyses.store.get('1|8|1.0-1')?.pluginOf).toEqual([]);
  });
});

describe('SignalIndex.recomputeBroken — start of the broken state', () => {
  // python is at 3.13, so a shipped python3.12 directory is a stale runtime.
  const staleRuntime = ['usr/lib/python3.12/site-packages/pkg/__init__.py'];
  const scannedAt = new Date('2026-09-01T00:00:00Z');

  async function recompute(seed: Partial<PackageElfAnalysis>, freshlyScanned: boolean) {
    const { index, analyses, packages } = createIndex();
    packages.seed([{ id: 5, pkgname: 'consumer', isActive: true } as Package]);
    analyses.seed([analysis({ pkgId: 5, scannedAt, ...seed })]);
    await index.recomputeBroken([{ pkgType: TriggerType.CHAOTIC, pkgId: 5 }], { freshlyScanned });
    return analyses.store.get('1|5|1.0-1');
  }

  it('dates a package that is broken as built to its scan', async () => {
    const after = await recompute({ files: staleRuntime }, true);

    expect(after?.broken).toBe(true);
    expect(after?.brokenSince).toEqual(scannedAt);
  });

  it('dates a later break to the check that found it', async () => {
    const before = Date.now();
    const after = await recompute({ files: staleRuntime }, false);

    expect(after?.brokenSince?.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('keeps the start of a break that continues', async () => {
    const brokenSince = new Date('2026-09-10T00:00:00Z');
    const after = await recompute({ files: staleRuntime, broken: true, brokenSince }, false);

    expect(after?.brokenSince).toEqual(brokenSince);
  });

  it('clears the start when the package is no longer broken', async () => {
    const after = await recompute({ broken: true, brokenSince: new Date('2026-09-10T00:00:00Z') }, false);

    expect(after?.broken).toBe(false);
    expect(after?.brokenSince).toBeNull();
  });
});
