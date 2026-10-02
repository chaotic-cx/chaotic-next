import type { HttpService } from '@nestjs/axios';
import type { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import type { ParsedPackage, RepoSettings } from '../interfaces/repo-manager';
import { ArchMirrorService, recordVersionChange } from './arch-mirror.service';
import { ArchlinuxPackage, PackageElfAnalysis } from './repo-manager.entity';
import type { SignalScanService } from './scan';
import { createMockRepository } from './test/mock-repository';

function archPackage(overrides: Partial<ArchlinuxPackage>): ArchlinuxPackage {
  return Object.assign(new ArchlinuxPackage(), {
    id: 1,
    pkgname: 'llvm-libs',
    version: '22.1.8-1',
    previousVersion: null,
    lastUpdated: null,
    triggersPending: false,
    ...overrides,
  });
}

describe('recordVersionChange', () => {
  it('stores the processed version as baseline and marks the change pending', () => {
    const row = archPackage({});

    recordVersionChange(row);

    expect(row.previousVersion).toBe('22.1.8-1');
    expect(row.triggersPending).toBe(true);
    expect(row.lastUpdated).toBeInstanceOf(Date);
  });

  it('keeps the baseline of an unprocessed change when the package changes again', () => {
    const row = archPackage({ version: '23.1.1-1', previousVersion: '22.1.8-1', triggersPending: true });

    recordVersionChange(row);

    expect(row.previousVersion).toBe('22.1.8-1');
  });
});

describe('ArchMirrorService change tracking', () => {
  const settings: RepoSettings = { regenDatabase: false, abiDryRun: false };

  function parsed(name: string, base: string, version: string, repoName = 'extra'): ParsedPackage {
    return {
      name,
      base,
      version,
      pkgrel: 1,
      bump: 0,
      repoName,
      metaData: { buildDate: '0', filename: `${name}-${version}.pkg.tar.zst` },
    };
  }

  function buildMirror(seeded: { pkgname: string; version: string }[]): ArchMirrorService {
    const archRepo = createMockRepository<ArchlinuxPackage>({ keyOf: (pkg) => pkg.pkgname });
    archRepo.seed(
      seeded.map((row, index) => ({
        ...row,
        id: index + 1,
        previousVersion: null,
        deactivatedAt: null,
        triggersPending: false,
      })),
    );
    return new ArchMirrorService(
      archRepo,
      createMockRepository<PackageElfAnalysis>({ keyOf: (a) => `${a.pkgType}|${a.pkgId}|${a.version}` }),
      {} as HttpService,
      {} as SignalScanService,
      { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as PinoLogger,
    );
  }

  async function sync(mirror: ArchMirrorService, packages: ParsedPackage[]): Promise<ArchlinuxPackage[]> {
    const internals = mirror as unknown as {
      determineChangedPackages(p: ParsedPackage[], s: RepoSettings): Promise<void>;
    };
    await internals.determineChangedPackages(packages, settings);
    return mirror.findPendingPackages();
  }

  it('tracks a version change of a split subpackage, not only of the base package', async () => {
    const mirror = buildMirror([
      { pkgname: 'llvm', version: '22.1.8' },
      { pkgname: 'llvm-libs', version: '22.1.8' },
    ]);

    const pending = await sync(mirror, [parsed('llvm', 'llvm', '23.1.1'), parsed('llvm-libs', 'llvm', '23.1.1')]);

    expect(pending.map((pkg) => [pkg.pkgname, pkg.previousVersion, pkg.version])).toEqual([
      ['llvm', '22.1.8', '23.1.1'],
      ['llvm-libs', '22.1.8', '23.1.1'],
    ]);
  });

  it('keeps an unprocessed change pending across runs', async () => {
    const mirror = buildMirror([{ pkgname: 'clang', version: '22.1.8' }]);
    await sync(mirror, [parsed('clang', 'clang', '23.1.1')]);

    const pending = await sync(mirror, [parsed('clang', 'clang', '23.1.1')]);

    expect(pending.map((pkg) => [pkg.pkgname, pkg.previousVersion])).toEqual([['clang', '22.1.8']]);
  });

  it('no longer reports a change once it is marked processed', async () => {
    const mirror = buildMirror([{ pkgname: 'clang', version: '22.1.8' }]);
    await mirror.clearTriggersPending(await sync(mirror, [parsed('clang', 'clang', '23.1.1')]));

    expect(await sync(mirror, [parsed('clang', 'clang', '23.1.1')])).toEqual([]);
  });

  /** One package of every Arch repo, so that a sync counts as complete. */
  function everyRepo(): ParsedPackage[] {
    return [
      parsed('glibc', 'glibc', '2.44', 'core'),
      parsed('bash', 'bash', '5.3', 'extra'),
      parsed('lib32-glibc', 'lib32-glibc', '2.44', 'multilib'),
    ];
  }

  it('records a package that left the sync DBs as a pending removal', async () => {
    const mirror = buildMirror([
      { pkgname: 'glibc', version: '2.44' },
      { pkgname: 'bash', version: '5.3' },
      { pkgname: 'lib32-glibc', version: '2.44' },
      { pkgname: 'qt5-virtualkeyboard', version: '5.15.18' },
    ]);

    const pending = await sync(mirror, everyRepo());

    expect(pending.map((pkg) => [pkg.pkgname, pkg.previousVersion, pkg.deactivatedAt !== null])).toEqual([
      ['qt5-virtualkeyboard', '5.15.18', true],
    ]);
  });

  it('removes nothing when the pull is missing an Arch repo', async () => {
    const mirror = buildMirror([
      { pkgname: 'glibc', version: '2.44' },
      { pkgname: 'qt5-virtualkeyboard', version: '5.15.18' },
    ]);

    expect(await sync(mirror, [parsed('glibc', 'glibc', '2.44', 'core')])).toEqual([]);
  });

  it('lets a removed package through without a current analysis, and never scans it', async () => {
    const mirror = buildMirror([
      { pkgname: 'glibc', version: '2.44' },
      { pkgname: 'bash', version: '5.3' },
      { pkgname: 'lib32-glibc', version: '2.44' },
      { pkgname: 'qt5-virtualkeyboard', version: '5.15.18' },
    ]);
    const pending = await sync(mirror, everyRepo());

    expect((await mirror.withCurrentAnalysis(pending)).map((pkg) => pkg.pkgname)).toEqual(['qt5-virtualkeyboard']);
    await expect(mirror.scanChangedArchPackages(pending, settings)).resolves.toBeUndefined();
  });
});
