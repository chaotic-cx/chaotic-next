/* eslint-disable @typescript-eslint/no-non-null-assertion -- test fixtures assert on freshly created entities */
import { describe, expect, it } from 'vitest';
import { TriggerType } from '../../interfaces/repo-manager';
import { ArchlinuxPackage, PackageElfAnalysis } from '../repo-manager.entity';
import { Package, Repo } from '../../builder/builder.entity';
import { SignalScanService } from './signal-scan.service';
import { MIN_PROVIDED_SONAMES } from '../signal';
import { createMockRepository } from '../test/mock-repository';
import type { MockRepository } from '../test/mock-repository';

function stalePythonFiles(): string[] {
  // python is seeded at 3.13.* below, so a 3.12 dir is a stale runtime install.
  return ['usr/lib/python3.12/site-packages/chaotic_test/__init__.py'];
}

function makeAnalysis(
  overrides: Partial<PackageElfAnalysis> & Pick<PackageElfAnalysis, 'pkgType' | 'pkgId' | 'version'>,
): PackageElfAnalysis {
  return {
    id: overrides.pkgId,
    files: stalePythonFiles(),
    neededSonames: [],
    providedSonames: [],
    importedSymbols: [],
    exportedSymbols: {},
    vtables: {},
    directoriesOwned: [],
    directDirectories: [],
    pluginOf: [],
    broken: false,
    brokenReasons: [],
    scannedAt: new Date(),
    ...overrides,
  } as PackageElfAnalysis;
}

function seedProvidedSonames(analysisRepo: MockRepository<PackageElfAnalysis>): void {
  const provider = makeAnalysis({ pkgType: '1', pkgId: 500, version: '1.0-1' });
  const providedSonames: string[] = [];
  for (let index = 0; index < MIN_PROVIDED_SONAMES + 20; index++) providedSonames.push(`libseed${index}.so.1`);
  provider.providedSonames = providedSonames;
  analysisRepo.seed([provider]);
}

function createService() {
  const analysisRepo = createMockRepository<PackageElfAnalysis>({
    keyOf: (a) => `${a.pkgType}|${a.pkgId}|${a.version}`,
  });
  const archPkgRepo = createMockRepository<ArchlinuxPackage>({ keyOf: (p) => String(p.id) });
  const packageRepo = createMockRepository<Package>({ keyOf: (p) => String(p.id) });
  const repoRepo = createMockRepository<Repo>({ keyOf: (r) => String(r.id) });

  // python at 3.13 makes any shipped python3.12 dir a stale-runtime break.
  archPkgRepo.seed([{ id: 1, pkgname: 'python', version: '3.13.1' } as ArchlinuxPackage]);

  const service = new SignalScanService(analysisRepo, archPkgRepo, packageRepo, repoRepo);
  return { service, analysisRepo, archPkgRepo, packageRepo };
}

describe('SignalScanService.recomputeBroken — Arch is never recomputed', () => {
  it('flags a broken Chaotic analysis but leaves an Arch analysis untouched (no filter)', async () => {
    const { service, analysisRepo } = createService();
    const arch = makeAnalysis({ pkgType: '0', pkgId: 1, version: '1.0-1' });
    const chaotic = makeAnalysis({ pkgType: '1', pkgId: 2, version: '1.0-1' });
    analysisRepo.seed([arch, chaotic]);

    await service.recomputeBroken();

    const archAfter = Array.from(analysisRepo.store.values()).find((a) => a.pkgType === '0')!;
    const chaoticAfter = Array.from(analysisRepo.store.values()).find((a) => a.pkgType === '1')!;

    // Chaotic ships a stale python3.12 dir -> must be flagged broken.
    expect(chaoticAfter.broken).toBe(true);
    expect(chaoticAfter.brokenReasons.some((r) => r.includes('python'))).toBe(true);

    // Arch ships the very same stale dir but must NEVER be judged broken.
    expect(archAfter.broken).toBe(false);
    expect(archAfter.brokenReasons).toEqual([]);
  });

  it('does not recompute anything when given an Arch-only filter', async () => {
    const { service, analysisRepo } = createService();
    const arch = makeAnalysis({ pkgType: '0', pkgId: 1, version: '1.0-1' });
    const chaotic = makeAnalysis({ pkgType: '1', pkgId: 2, version: '1.0-1' });
    analysisRepo.seed([arch, chaotic]);

    // An all-Arch filter must short-circuit: it must NOT fall through to
    // recomputing every Chaotic analysis.
    await service.recomputeBroken([{ pkgType: TriggerType.ARCH, pkgId: 1 }]);

    const chaoticAfter = Array.from(analysisRepo.store.values()).find((a) => a.pkgType === '1')!;
    expect(chaoticAfter.broken).toBe(false);
    expect(chaoticAfter.brokenReasons).toEqual([]);
  });
});

describe('SignalScanService.recomputeBroken — skip-signal-scanned packages are never judged broken', () => {
  it('clears broken flags of a binary-only package (skipSignalScan)', async () => {
    const { service, analysisRepo, packageRepo } = createService();
    const broken = makeAnalysis({ pkgType: '1', pkgId: 10, version: '1.0-1' });
    broken.broken = true;
    broken.brokenReasons = ['missing libc.so.1'];
    analysisRepo.seed([broken]);
    packageRepo.seed([{ id: 10, pkgname: 'quartus-130', skipSignalScan: true } as Package]);

    await service.recomputeBroken();

    const after = Array.from(analysisRepo.store.values()).find((a) => a.pkgType === '1' && a.pkgId === 10);
    expect(after).toBeUndefined();
  });

  it('deletes the ELF analysis rows of a binary-only package with skipSignalScan true', async () => {
    const { service, analysisRepo, packageRepo } = createService();
    seedProvidedSonames(analysisRepo);
    const analysis = makeAnalysis({ pkgType: '1', pkgId: 11, version: '1.0-1' });
    analysis.neededSonames = ['libc.so.1'];
    analysis.files = [];
    analysisRepo.seed([analysis]);
    packageRepo.seed([{ id: 11, pkgname: 'quartus-130', skipSignalScan: true } as Package]);

    await service.recomputeBroken();

    const after = Array.from(analysisRepo.store.values()).find((a) => a.pkgType === '1' && a.pkgId === 11);
    expect(after).toBeUndefined();
  });

  it('still flags a normal package with the same missing soname', async () => {
    const { service, analysisRepo } = createService();
    seedProvidedSonames(analysisRepo);
    const analysis = makeAnalysis({ pkgType: '1', pkgId: 12, version: '1.0-1' });
    analysis.neededSonames = ['libc.so.1'];
    analysis.files = [];
    analysisRepo.seed([analysis]);

    await service.recomputeBroken();

    const after = Array.from(analysisRepo.store.values()).find((a) => a.pkgType === '1' && a.pkgId === 12)!;
    expect(after.broken).toBe(true);
    expect(after.brokenReasons.some((r) => r.includes('libc.so.1'))).toBe(true);
  });
});

describe('SignalScanService.recomputeBroken — only latest version per package is recomputed', () => {
  it('recomputes only the latest version when multiple versions exist', async () => {
    const { service, analysisRepo } = createService();
    // Old version flagged broken for a stale soname, current version is fine.
    const old = makeAnalysis({
      pkgType: '1',
      pkgId: 20,
      version: '1.0-1',
      broken: true,
      brokenReasons: ['old reason'],
    });
    const current = makeAnalysis({ pkgType: '1', pkgId: 20, version: '2.0-1', broken: false, brokenReasons: [] });
    analysisRepo.seed([old, current]);

    await service.recomputeBroken();

    const analyses = Array.from(analysisRepo.store.values()).filter((a) => a.pkgId === 20);
    const oldAfter = analyses.find((a) => a.version === '1.0-1')!;
    const currentAfter = analyses.find((a) => a.version === '2.0-1')!;

    // Old version must keep its stale broken flag — not recomputed.
    expect(oldAfter.broken).toBe(true);
    expect(oldAfter.brokenReasons).toEqual(['old reason']);

    // Current version is recomputed (stale python dir → broken).
    expect(currentAfter.broken).toBe(true);
    expect(currentAfter.brokenReasons.some((r) => r.includes('python'))).toBe(true);
  });

  it('recomputes only the latest version when filtered', async () => {
    const { service, analysisRepo } = createService();
    // Two different packages, each with old + current versions.
    const oldA = makeAnalysis({ pkgType: '1', pkgId: 30, version: '1.0-1', broken: true, brokenReasons: ['stale'] });
    const currentA = makeAnalysis({ pkgType: '1', pkgId: 30, version: '2.0-1', broken: false, brokenReasons: [] });
    const oldB = makeAnalysis({ pkgType: '1', pkgId: 31, version: '1.0-1', broken: true, brokenReasons: ['old'] });
    const currentB = makeAnalysis({ pkgType: '1', pkgId: 31, version: '3.0-1', broken: false, brokenReasons: [] });
    analysisRepo.seed([oldA, currentA, oldB, currentB]);

    // Unfiltered recompute: only latest versions get recomputed.
    await service.recomputeBroken();

    const pkg30 = Array.from(analysisRepo.store.values()).filter((a) => a.pkgId === 30);
    const pkg31 = Array.from(analysisRepo.store.values()).filter((a) => a.pkgId === 31);

    // Old versions keep their stale flags.
    expect(pkg30.find((a) => a.version === '1.0-1')!.broken).toBe(true);
    expect(pkg30.find((a) => a.version === '1.0-1')!.brokenReasons).toEqual(['stale']);
    expect(pkg31.find((a) => a.version === '1.0-1')!.broken).toBe(true);
    expect(pkg31.find((a) => a.version === '1.0-1')!.brokenReasons).toEqual(['old']);

    // Current versions are recomputed (stale python dir → broken).
    expect(pkg30.find((a) => a.version === '2.0-1')!.broken).toBe(true);
    expect(pkg30.find((a) => a.version === '2.0-1')!.brokenReasons.some((r) => r.includes('python'))).toBe(true);
    expect(pkg31.find((a) => a.version === '3.0-1')!.broken).toBe(true);
    expect(pkg31.find((a) => a.version === '3.0-1')!.brokenReasons.some((r) => r.includes('python'))).toBe(true);
  });
});
