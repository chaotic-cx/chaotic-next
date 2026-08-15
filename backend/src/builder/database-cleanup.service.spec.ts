import { DataSource, Repository, UpdateResult } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { PackageBump, PackageElfAnalysis } from '../repo-manager/repo-manager.entity';
import { SignalScanService } from '../repo-manager/scan';
import { Package } from './builder.entity';
import { DatabaseCleanupService } from './database-cleanup.service';

function mockUpdateQueryBuilder({ affected }: { affected: number }) {
  const execute = vi.fn().mockResolvedValue({ affected } as UpdateResult);
  const qb = {
    update: vi.fn(() => qb),
    set: vi.fn(() => qb),
    where: vi.fn(() => qb),
    andWhere: vi.fn(() => qb),
    execute,
  };
  return qb;
}

function mockSelectQueryBuilder({ candidates }: { candidates: { id: number }[] }) {
  const qb = {
    select: vi.fn(() => qb),
    leftJoin: vi.fn(() => qb),
    where: vi.fn(() => qb),
    andWhere: vi.fn(() => qb),
    getRawMany: vi.fn().mockResolvedValue(candidates),
  };
  return qb;
}

function createService(options: { affected?: number; candidates?: { id: number }[] }) {
  const updateQb = mockUpdateQueryBuilder({ affected: options.affected ?? 0 });
  const selectQb = mockSelectQueryBuilder({ candidates: options.candidates ?? [] });

  const packageRepository = {
    createQueryBuilder: vi.fn(() => updateQb),
  } as unknown as Repository<Package>;

  const elfAnalysisRepo = {
    delete: vi.fn().mockResolvedValue({ affected: options.candidates?.length ?? 0 }),
  };
  const bumpRepo = {
    delete: vi.fn().mockResolvedValue({ affected: options.candidates?.length ?? 0 }),
  };
  const pkgRepo = {
    createQueryBuilder: vi.fn(() => selectQb),
    delete: vi.fn().mockResolvedValue({ affected: options.candidates?.length ?? 0 }),
  };

  const manager = {
    getRepository: vi.fn((entity) => {
      if (entity === PackageElfAnalysis) return elfAnalysisRepo;
      if (entity === PackageBump) return bumpRepo;
      return pkgRepo;
    }),
  };
  const dataSource = {
    transaction: vi.fn(async (fn: (m: typeof manager) => Promise<void>) => fn(manager)),
  } as unknown as DataSource;
  const signalScanService = createSignalScanStub();
  const analysisRepository = {
    find: vi.fn(),
    delete: vi.fn().mockResolvedValue(undefined),
  } as unknown as Repository<PackageElfAnalysis>;

  return {
    service: new DatabaseCleanupService(packageRepository, analysisRepository, dataSource, signalScanService),
    qb: updateQb,
    selectQb,
    manager,
    elfAnalysisRepo,
    bumpRepo,
    pkgRepo,
    dataSource,
    signalScanService,
    analysisRepository,
  };
}

function createSignalScanStub(): SignalScanService {
  return {
    invalidateDirectoryIndex: vi.fn(),
  } as unknown as SignalScanService;
}

describe('DatabaseCleanupService', () => {
  it('deactivates active orphaned packages without a repo', async () => {
    const { service, qb } = createService({ affected: 5, candidates: [] });

    await service.purgeOrphanedPackages();

    expect(qb.set).toHaveBeenCalledWith({ isActive: false });
    expect(qb.execute).toHaveBeenCalledTimes(1);
  });

  it('purges orphaned packages not referenced by a build within a transaction', async () => {
    const ids = [10, 11, 12];
    const { service, manager, elfAnalysisRepo, bumpRepo, pkgRepo, dataSource, signalScanService } = createService({
      affected: 5,
      candidates: ids.map((id) => ({ id })),
    });

    await service.purgeOrphanedPackages();

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.getRepository).toHaveBeenCalledTimes(4);
    expect(elfAnalysisRepo.delete).toHaveBeenCalledTimes(1);
    expect(bumpRepo.delete).toHaveBeenCalledTimes(1);
    expect(pkgRepo.delete).toHaveBeenCalledTimes(1);
    expect(signalScanService.invalidateDirectoryIndex).toHaveBeenCalledTimes(1);
  });

  it('skips the delete phase when there are no candidates', async () => {
    const { service, manager, elfAnalysisRepo, dataSource } = createService({ affected: 0, candidates: [] });

    await service.purgeOrphanedPackages();

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.getRepository).toHaveBeenCalledTimes(1);
    expect(elfAnalysisRepo.delete).not.toHaveBeenCalled();
  });

  it('logs and swallows errors from the data source', async () => {
    const qb = mockUpdateQueryBuilder({ affected: 1 });
    const packageRepository = {
      createQueryBuilder: vi.fn(() => qb),
    } as unknown as Repository<Package>;
    const dataSource = {
      transaction: vi.fn(() => Promise.reject(new Error('db down'))),
    } as unknown as DataSource;
    const signalScanService = createSignalScanStub();
    const analysisRepository = {} as unknown as Repository<PackageElfAnalysis>;

    const service = new DatabaseCleanupService(packageRepository, analysisRepository, dataSource, signalScanService);

    await expect(service.purgeOrphanedPackages()).resolves.toBeUndefined();
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('purges analysis versions beyond the latest and previous', async () => {
    const { service, analysisRepository, signalScanService } = createService({ affected: 0, candidates: [] });
    const analyses = [
      { id: 1, pkgType: '0', pkgId: 100, version: '1.0-1' },
      { id: 2, pkgType: '0', pkgId: 100, version: '1.1-1' },
      { id: 3, pkgType: '0', pkgId: 100, version: '1.2-1' },
      { id: 4, pkgType: '0', pkgId: 101, version: '2:9.0-1' },
      { id: 5, pkgType: '0', pkgId: 101, version: '2:10.0-1' },
      { id: 6, pkgType: '0', pkgId: 101, version: '2:11.0-1' },
    ] as PackageElfAnalysis[];
    (analysisRepository.find as ReturnType<typeof vi.fn>).mockResolvedValue(analyses);

    await service.purgeSupersededAnalyses();

    // pkgId 100 keeps 1.2-1 + 1.1-1, drops 1.0-1 (id 1).
    // pkgId 101 keeps 2:11.0-1 + 2:10.0-1, drops 2:9.0-1 (id 4).
    expect(analysisRepository.delete).toHaveBeenCalledWith([1, 4]);
    expect(signalScanService.invalidateDirectoryIndex).toHaveBeenCalledTimes(1);
  });

  it('keeps the previous version for ABI reference (no purge when <= 2 versions)', async () => {
    const { service, analysisRepository, signalScanService } = createService({ affected: 0, candidates: [] });
    const analyses = [
      { id: 1, pkgType: '0', pkgId: 200, version: '1.0-1' },
      { id: 2, pkgType: '0', pkgId: 200, version: '1.1-1' },
    ] as PackageElfAnalysis[];
    (analysisRepository.find as ReturnType<typeof vi.fn>).mockResolvedValue(analyses);

    await service.purgeSupersededAnalyses();

    expect(analysisRepository.delete).not.toHaveBeenCalled();
    expect(signalScanService.invalidateDirectoryIndex).not.toHaveBeenCalled();
  });
});
