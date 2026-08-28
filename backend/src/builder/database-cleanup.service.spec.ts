import { type PinoLogger } from 'nestjs-pino';

const pinoStub = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as unknown as PinoLogger;
import { DataSource, Repository, UpdateResult } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { RouterHit } from '../router/router-hit.entity';
import { PackageBump, PackageElfAnalysis } from '../repo-manager/repo-manager.entity';
import { SignalScanService } from '../repo-manager/scan';
import { Package, SilencedBuildFailure } from './builder.entity';
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

function mockDeleteQueryBuilder(affected: number) {
  const execute = vi.fn().mockResolvedValue({ affected });
  const qb = {
    delete: vi.fn(() => qb),
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

function createService(options: { affected?: number; candidates?: { id: number }[]; routerHits?: number[] }) {
  const updateQb = mockUpdateQueryBuilder({ affected: options.affected ?? 0 });
  const selectQb = mockSelectQueryBuilder({ candidates: options.candidates ?? [] });
  const routerHitQbs = (options.routerHits ?? [0]).map(mockDeleteQueryBuilder);

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
  const routerHitRepo = {
    createQueryBuilder: vi.fn(() => routerHitQbs.shift() ?? mockDeleteQueryBuilder(0)),
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
    getRepository: vi.fn((entity) => (entity === RouterHit ? routerHitRepo : manager.getRepository(entity))),
  } as unknown as DataSource;
  const signalScanService = createSignalScanStub();
  const analysisRepository = {
    find: vi.fn(),
    delete: vi.fn().mockResolvedValue(undefined),
  } as unknown as Repository<PackageElfAnalysis>;

  return {
    service: new DatabaseCleanupService(packageRepository, analysisRepository, dataSource, signalScanService, pinoStub),
    qb: updateQb,
    selectQb,
    manager,
    elfAnalysisRepo,
    bumpRepo,
    pkgRepo,
    routerHitRepo,
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

  it('deactivates active packages with an invalid name', async () => {
    const { service, qb } = createService({ affected: 3, candidates: [] });

    await service.purgeInvalidNamedPackages();

    expect(qb.set).toHaveBeenCalledWith({ isActive: false });
    expect(qb.execute).toHaveBeenCalledTimes(1);
  });

  it('purges invalid-named packages even when build-referenced', async () => {
    const ids = [415, 17773, 17581];
    const { service, manager, elfAnalysisRepo, bumpRepo, pkgRepo, dataSource, signalScanService } = createService({
      affected: 3,
      candidates: ids.map((id) => ({ id })),
    });

    await service.purgeInvalidNamedPackages();

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(elfAnalysisRepo.delete).toHaveBeenCalledTimes(1);
    expect(bumpRepo.delete).toHaveBeenCalledTimes(1);
    expect(pkgRepo.delete).toHaveBeenCalledTimes(1);
    expect(signalScanService.invalidateDirectoryIndex).toHaveBeenCalledTimes(1);
    void manager;
  });

  it('skips the delete phase for invalid names when there are no candidates', async () => {
    const { service, manager, dataSource, elfAnalysisRepo } = createService({ affected: 0, candidates: [] });

    await service.purgeInvalidNamedPackages();

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.getRepository).toHaveBeenCalledTimes(1);
    expect(elfAnalysisRepo.delete).not.toHaveBeenCalled();
  });

  it('deactivates packages whose only builds are stale', async () => {
    const { service, qb } = createService({ affected: 7, candidates: [] });

    await service.purgeStaleBuildReferencedPackages();

    expect(qb.set).toHaveBeenCalledWith({ isActive: false });
    expect(qb.execute).toHaveBeenCalledTimes(1);
  });

  it('purges build-referenced packages whose newest build is stale', async () => {
    const ids = [500, 501];
    const { service, manager, elfAnalysisRepo, bumpRepo, pkgRepo, dataSource, signalScanService } = createService({
      affected: 7,
      candidates: ids.map((id) => ({ id })),
    });

    await service.purgeStaleBuildReferencedPackages();

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(elfAnalysisRepo.delete).toHaveBeenCalledTimes(1);
    expect(bumpRepo.delete).toHaveBeenCalledTimes(1);
    expect(pkgRepo.delete).toHaveBeenCalledTimes(1);
    expect(signalScanService.invalidateDirectoryIndex).toHaveBeenCalledTimes(1);
    void manager;
  });

  it('skips the delete phase when no packages have stale builds', async () => {
    const { service, dataSource, elfAnalysisRepo } = createService({ affected: 0, candidates: [] });

    await service.purgeStaleBuildReferencedPackages();

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
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

    const service = new DatabaseCleanupService(
      packageRepository,
      analysisRepository,
      dataSource,
      signalScanService,
      pinoStub,
    );

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

  it('purges old router hits older than the retention window', async () => {
    const { service, dataSource, routerHitRepo } = createService({
      affected: 0,
      candidates: [],
      routerHits: [10_000, 10_000, 5_000],
    });

    await service.purgeOldRouterHits();

    expect(dataSource.getRepository).toHaveBeenCalledWith(RouterHit);
    expect(routerHitRepo.createQueryBuilder).toHaveBeenCalledTimes(3);
  });

  it('purges router hits in a single batch when below the batch size', async () => {
    const { service, routerHitRepo } = createService({ affected: 0, candidates: [], routerHits: [2_000] });

    await service.purgeOldRouterHits();

    expect(routerHitRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
  });

  it('logs and swallows router-hits purge errors', async () => {
    const routerHitRepo = {
      createQueryBuilder: vi.fn(() => {
        throw new Error('db down');
      }),
    };
    const dataSource = {
      getRepository: vi.fn(() => routerHitRepo),
    } as unknown as DataSource;
    const signalScanService = createSignalScanStub();
    const analysisRepository = {} as unknown as Repository<PackageElfAnalysis>;
    const packageRepository = {} as unknown as Repository<Package>;

    const service = new DatabaseCleanupService(
      packageRepository,
      analysisRepository,
      dataSource,
      signalScanService,
      pinoStub,
    );

    await expect(service.purgeOldRouterHits()).resolves.toBeUndefined();
  });

  describe('purgeOrphanedFailureSilences', () => {
    it('deletes silences whose package is not active anymore', async () => {
      const silencedRepo = {
        createQueryBuilder: vi.fn(() => mockDeleteQueryBuilder(3)),
      };
      const dataSource = {
        getRepository: vi.fn((entity) => (entity === SilencedBuildFailure ? silencedRepo : {})),
      } as unknown as DataSource;
      const service = new DatabaseCleanupService(
        {} as unknown as Repository<Package>,
        {} as unknown as Repository<PackageElfAnalysis>,
        dataSource,
        createSignalScanStub(),
        pinoStub,
      );

      await service.purgeOrphanedFailureSilences();

      expect(dataSource.getRepository).toHaveBeenCalledWith(SilencedBuildFailure);
      const qb = silencedRepo.createQueryBuilder.mock.results[0]?.value;
      expect(qb.where).toHaveBeenCalledWith(expect.stringContaining('p.pkgname = "silenced_build_failure"."pkgname"'));
      expect(qb.execute).toHaveBeenCalledTimes(1);
    });

    it('logs and swallows purge errors', async () => {
      const silencedRepo = {
        createQueryBuilder: vi.fn(() => {
          throw new Error('db down');
        }),
      };
      const dataSource = {
        getRepository: vi.fn(() => silencedRepo),
      } as unknown as DataSource;
      const service = new DatabaseCleanupService(
        {} as unknown as Repository<Package>,
        {} as unknown as Repository<PackageElfAnalysis>,
        dataSource,
        createSignalScanStub(),
        pinoStub,
      );

      await expect(service.purgeOrphanedFailureSilences()).resolves.toBeUndefined();
    });
  });
});
