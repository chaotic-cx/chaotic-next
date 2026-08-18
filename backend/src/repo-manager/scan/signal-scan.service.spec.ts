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

    const after = Array.from(analysisRepo.store.values()).find((a) => a.pkgType === '1')!;
    expect(after.broken).toBe(false);
    expect(after.brokenReasons).toEqual([]);
  });

  it('does not re-flag a binary-only package with a genuinely missing soname', async () => {
    const { service, analysisRepo, packageRepo } = createService();
    seedProvidedSonames(analysisRepo);
    const analysis = makeAnalysis({ pkgType: '1', pkgId: 11, version: '1.0-1' });
    analysis.neededSonames = ['libc.so.1'];
    analysis.files = [];
    analysisRepo.seed([analysis]);
    packageRepo.seed([{ id: 11, pkgname: 'quartus-130', skipSignalScan: true } as Package]);

    await service.recomputeBroken();

    const after = Array.from(analysisRepo.store.values()).find((a) => a.pkgType === '1' && a.pkgId === 11)!;
    expect(after.broken).toBe(false);
    expect(after.brokenReasons).toEqual([]);
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
