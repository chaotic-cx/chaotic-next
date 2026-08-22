import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { PinoLogger } from 'nestjs-pino';
import type { Repository } from 'typeorm';
import { describe, expect, it } from 'vitest';
import { Package, Repo } from '../builder/builder.entity';
import { BumpService } from './bump';
import { ChaoticIndexService } from './chaotic-index.service';
import { ArchMirrorService } from './arch-mirror.service';
import { RepoManagerService } from './repo-manager.service';
import { ArchlinuxPackage, PackageBump, PackageElfAnalysis } from './repo-manager.entity';
import type { RepoReaderFactory, RepoWriter } from './repo-rw';
import { RebuildTriggerService, SignalScanService } from './scan';
import { SeedTransferService } from './seed-transfer.service';
import { createMockRepository, MockRepository } from './test/mock-repository';

describe('RepoManagerService.getBrokenPackages', () => {
  it('returns only the latest version per package, not stale broken versions', async () => {
    const packageRepository = createMockRepository<Package>({ keyOf: (p) => String(p.id) });
    const archlinuxPackageRepository = createMockRepository<ArchlinuxPackage>({ keyOf: (p) => String(p.id) });
    const elfAnalysisRepository = createMockRepository<PackageElfAnalysis>({
      keyOf: (a) => `${a.pkgType}:${a.pkgId}:${a.version}`,
    });

    packageRepository.seed([
      { id: 100, pkgname: 'wsjtx-improved-qt6', isActive: true, repo: { id: 1, name: 'chaotic-aur' } as Repo },
    ]);

    // Old version broken for boost 1.91.0, current version fine with boost 1.92.0.
    elfAnalysisRepository.seed([
      {
        pkgType: '1',
        pkgId: 100,
        version: '3.1.0+260522',
        broken: true,
        brokenReasons: ['missing soname libboost_filesystem.so.1.91.0'],
      },
      {
        pkgType: '1',
        pkgId: 100,
        version: '3.1.0+270822',
        broken: false,
        brokenReasons: [],
      },
    ]);

    const service = buildService(packageRepository, archlinuxPackageRepository, elfAnalysisRepository);

    const result = await service.getBrokenPackages();

    // Only the latest (non-broken) version should appear — actually neither
    // appears because neither is broken after dedup (latest is not broken).
    // But if the latest IS broken, only that one shows.
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('shows the latest version when it is broken', async () => {
    const packageRepository = createMockRepository<Package>({ keyOf: (p) => String(p.id) });
    const archlinuxPackageRepository = createMockRepository<ArchlinuxPackage>({ keyOf: (p) => String(p.id) });
    const elfAnalysisRepository = createMockRepository<PackageElfAnalysis>({
      keyOf: (a) => `${a.pkgType}:${a.pkgId}:${a.version}`,
    });

    packageRepository.seed([
      { id: 200, pkgname: 'test-pkg', isActive: true, repo: { id: 2, name: 'chaotic-aur' } as Repo },
    ]);

    // Old version was fine, current version is broken.
    elfAnalysisRepository.seed([
      {
        pkgType: '1',
        pkgId: 200,
        version: '1.0-1',
        broken: false,
        brokenReasons: [],
      },
      {
        pkgType: '1',
        pkgId: 200,
        version: '2.0-1',
        broken: true,
        brokenReasons: ['missing soname libfoo.so.2'],
      },
    ]);

    const service = buildService(packageRepository, archlinuxPackageRepository, elfAnalysisRepository);

    const result = await service.getBrokenPackages();

    expect(result.items).toHaveLength(1);
    expect(result.items[0].pkgname).toBe('test-pkg');
    expect(result.items[0].version).toBe('2.0-1');
    expect(result.items[0].reasons).toEqual(['missing soname libfoo.so.2']);
    expect(result.total).toBe(1);
  });

  it('does not show a stale broken version when the latest is fine', async () => {
    const packageRepository = createMockRepository<Package>({ keyOf: (p) => String(p.id) });
    const archlinuxPackageRepository = createMockRepository<ArchlinuxPackage>({ keyOf: (p) => String(p.id) });
    const elfAnalysisRepository = createMockRepository<PackageElfAnalysis>({
      keyOf: (a) => `${a.pkgType}:${a.pkgId}:${a.version}`,
    });

    packageRepository.seed([
      { id: 300, pkgname: 'boost-user', isActive: true, repo: { id: 3, name: 'chaotic-aur' } as Repo },
    ]);

    // Old version broken for boost 1.91.0, current version fixed with 1.92.0.
    elfAnalysisRepository.seed([
      {
        pkgType: '1',
        pkgId: 300,
        version: '1.0-1',
        broken: true,
        brokenReasons: ['missing soname libboost_log.so.1.91.0'],
      },
      {
        pkgType: '1',
        pkgId: 300,
        version: '2.0-1',
        broken: false,
        brokenReasons: [],
      },
    ]);

    const service = buildService(packageRepository, archlinuxPackageRepository, elfAnalysisRepository);

    const result = await service.getBrokenPackages();

    // The stale broken version must not appear.
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('sorts broken packages by pkgname ascending', async () => {
    const packageRepository = createMockRepository<Package>({ keyOf: (p) => String(p.id) });
    const archlinuxPackageRepository = createMockRepository<ArchlinuxPackage>({ keyOf: (p) => String(p.id) });
    const elfAnalysisRepository = createMockRepository<PackageElfAnalysis>({
      keyOf: (a) => `${a.pkgType}:${a.pkgId}:${a.version}`,
    });

    packageRepository.seed([
      { id: 1, pkgname: 'zebra-pkg', isActive: true, repo: { id: 1, name: 'chaotic-aur' } as Repo },
      { id: 2, pkgname: 'alpha-pkg', isActive: true, repo: { id: 1, name: 'chaotic-aur' } as Repo },
      { id: 3, pkgname: 'beta-pkg', isActive: true, repo: { id: 1, name: 'chaotic-aur' } as Repo },
    ]);

    elfAnalysisRepository.seed([
      { pkgType: '1', pkgId: 1, version: '1.0', broken: true, brokenReasons: ['reason-z'] },
      { pkgType: '1', pkgId: 2, version: '1.0', broken: true, brokenReasons: ['reason-a'] },
      { pkgType: '1', pkgId: 3, version: '1.0', broken: true, brokenReasons: ['reason-b'] },
    ]);

    const service = buildService(packageRepository, archlinuxPackageRepository, elfAnalysisRepository);
    const result = await service.getBrokenPackages();

    expect(result.items.map((i) => i.pkgname)).toEqual(['alpha-pkg', 'beta-pkg', 'zebra-pkg']);
    expect(result.total).toBe(3);
  });

  it('filters out binary packages from the broken list', async () => {
    const packageRepository = createMockRepository<Package>({ keyOf: (p) => String(p.id) });
    const archlinuxPackageRepository = createMockRepository<ArchlinuxPackage>({ keyOf: (p) => String(p.id) });
    const elfAnalysisRepository = createMockRepository<PackageElfAnalysis>({
      keyOf: (a) => `${a.pkgType}:${a.pkgId}:${a.version}`,
    });

    packageRepository.seed([
      { id: 1, pkgname: 'eclipse-java-bin', isActive: true, repo: { id: 1, name: 'chaotic-aur' } as Repo },
      {
        id: 2,
        pkgname: 'android-studio',
        isActive: true,
        skipSignalScan: true,
        repo: { id: 1, name: 'chaotic-aur' } as Repo,
      },
      {
        id: 3,
        pkgname: 'crossover',
        isActive: true,
        skipSignalScan: true,
        repo: { id: 1, name: 'chaotic-aur' } as Repo,
      },
      {
        id: 4,
        pkgname: 'real-broken-pkg',
        isActive: true,
        skipSignalScan: false,
        repo: { id: 1, name: 'chaotic-aur' } as Repo,
      },
    ]);

    elfAnalysisRepository.seed([
      { pkgType: '1', pkgId: 1, version: '1.0', broken: true, brokenReasons: ['missing libc.so.8'] },
      { pkgType: '1', pkgId: 2, version: '1.0', broken: true, brokenReasons: ['missing libtinfo.so.5'] },
      { pkgType: '1', pkgId: 3, version: '1.0', broken: true, brokenReasons: ['missing libpcap.so.0.8'] },
      { pkgType: '1', pkgId: 4, version: '1.0', broken: true, brokenReasons: ['missing libboost.so'] },
    ]);

    const service = buildService(packageRepository, archlinuxPackageRepository, elfAnalysisRepository);
    const result = await service.getBrokenPackages();

    expect(result.items).toHaveLength(1);
    expect(result.items[0].pkgname).toBe('real-broken-pkg');
    expect(result.total).toBe(1);
  });
});

describe('RepoManagerService.getRebuildTriggerSources', () => {
  it('uses the analysis of a sibling row when the most recently updated package has none', async () => {
    const packageRepository = createMockRepository<Package>({ keyOf: (p) => String(p.id) });
    const archlinuxPackageRepository = createMockRepository<ArchlinuxPackage>({ keyOf: (p) => String(p.id) });
    const elfAnalysisRepository = createMockRepository<PackageElfAnalysis>({
      keyOf: (a) => `${a.pkgType}:${a.pkgId}:${a.version}`,
    });

    // Two active rows share the name; the newest (10) has no ELF analysis while
    // the older one (18111) does. A lookup restricted to the newest row would
    // wrongly report an empty dependency graph.
    packageRepository.seed([
      {
        id: 10,
        pkgname: 'firedragon',
        isActive: true,
        lastUpdated: '2026-08-06T00:00:00.000Z',
        metadata: { deps: ['libx11'] },
      },
      {
        id: 18111,
        pkgname: 'firedragon',
        isActive: true,
        lastUpdated: '2026-08-01T00:00:00.000Z',
        metadata: { deps: ['libx11'] },
      },
    ]);
    archlinuxPackageRepository.seed([{ id: 1, pkgname: 'libx11' }]);
    elfAnalysisRepository.seed([
      {
        id: 100,
        pkgType: '1',
        pkgId: 18111,
        version: '2:13.1.3',
        neededSonames: ['libX11.so.6'],
        providedSonames: [],
        pluginOf: [],
      },
      {
        id: 200,
        pkgType: '0',
        pkgId: 1,
        version: '1.8',
        neededSonames: [],
        providedSonames: ['libX11.so.6'],
        pluginOf: [],
      },
    ]);

    const service = buildService(packageRepository, archlinuxPackageRepository, elfAnalysisRepository);

    const result = await service.getRebuildTriggerSources('firedragon');

    expect(result.pkgname).toBe('firedragon');
    expect(result.sonameDependencies).toHaveLength(1);
    expect(result.sonameDependencies[0]).toEqual({
      soname: 'libX11.so.6',
      providers: [{ pkgname: 'libx11', pkgType: 'arch' }],
    });
  });

  it('returns empty dependency data when no package has an analysis', async () => {
    const packageRepository = createMockRepository<Package>({ keyOf: (p) => String(p.id) });
    const archlinuxPackageRepository = createMockRepository<ArchlinuxPackage>({ keyOf: (p) => String(p.id) });
    const elfAnalysisRepository = createMockRepository<PackageElfAnalysis>({
      keyOf: (a) => `${a.pkgType}:${a.pkgId}:${a.version}`,
    });

    packageRepository.seed([
      { id: 7, pkgname: 'nobody', isActive: true, lastUpdated: '2026-08-06T00:00:00.000Z', metadata: {} },
    ]);

    const service = buildService(packageRepository, archlinuxPackageRepository, elfAnalysisRepository);

    const result = await service.getRebuildTriggerSources('nobody');

    expect(result.sonameDependencies).toEqual([]);
    expect(result.pluginOwners).toEqual([]);
    expect(result.explicitTriggers).toEqual([]);
  });
});

function buildService(
  packageRepository: MockRepository<Package>,
  archlinuxPackageRepository: MockRepository<ArchlinuxPackage>,
  elfAnalysisRepository: MockRepository<PackageElfAnalysis>,
): RepoManagerService {
  return new RepoManagerService(
    {} as ConfigService,
    {} as HttpService,
    {} as PinoLogger,
    archlinuxPackageRepository,
    {} as Repository<Repo>,
    packageRepository,
    {} as Repository<PackageBump>,
    elfAnalysisRepository,
    {} as SignalScanService,
    {} as SeedTransferService,
    {} as ArchMirrorService,
    {} as ChaoticIndexService,
    {} as RebuildTriggerService,
    {} as BumpService,
    {} as RepoWriter,
    {} as RepoReaderFactory,
  );
}
