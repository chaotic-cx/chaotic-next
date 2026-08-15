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
