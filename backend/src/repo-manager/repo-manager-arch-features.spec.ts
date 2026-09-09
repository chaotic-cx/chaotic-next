import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';
import type { Repository } from 'typeorm';
import { describe, expect, it } from 'vitest';
import { Package, Repo } from '../builder/builder.entity';
import { ArchMirrorService } from './arch-mirror.service';
import { BumpService } from './bump';
import { ChaoticIndexService } from './chaotic-index.service';
import { ArchlinuxPackage, PackageElfAnalysis } from './repo-manager.entity';
import { RepoManagerService } from './repo-manager.service';
import type { RepoReaderFactory, RepoWriter } from './repo-rw';
import { RebuildTriggerService, SignalScanService } from './scan';
import { createMockRepository } from './test/mock-repository';

function buildService(
  archRepo: ReturnType<typeof createMockRepository<ArchlinuxPackage>>,
  packageRepo: ReturnType<typeof createMockRepository<Package>>,
): RepoManagerService {
  const elfRepo = createMockRepository<PackageElfAnalysis>({ keyOf: (a) => `${a.pkgType}:${a.pkgId}:${a.version}` });
  return new RepoManagerService(
    {} as ConfigService,
    {} as HttpService,
    {} as PinoLogger,
    archRepo as unknown as Repository<ArchlinuxPackage>,
    {} as Repository<Repo>,
    packageRepo as unknown as Repository<Package>,
    elfRepo as unknown as Repository<PackageElfAnalysis>,
    {} as SignalScanService,
    {} as ArchMirrorService,
    {} as ChaoticIndexService,
    {} as RebuildTriggerService,
    {} as BumpService,
    {} as SchedulerRegistry,
    {} as RepoWriter,
    {} as RepoReaderFactory,
  );
}

describe('RepoManagerService.getMissingDependencies', () => {
  it('ignores .so deps, strips version and checks provides + pkgbase', async () => {
    const archRepo = createMockRepository<ArchlinuxPackage>({ keyOf: (p) => String(p.id) });
    const packageRepo = createMockRepository<Package>({ keyOf: (p) => String(p.id) });

    archRepo.seed([
      {
        id: 1,
        pkgname: 'arch-lib',
        deactivatedAt: null,
        metadata: { filename: 'x', buildDate: '0', provides: ['foo=1.0'] },
      },
      {
        id: 2,
        pkgname: 'old-lib',
        deactivatedAt: new Date(),
        metadata: { filename: 'x', buildDate: '0', provides: ['bar'] },
      },
    ]);
    packageRepo.seed([
      {
        id: 10,
        pkgname: 'pkg-a',
        pkgbaseName: 'pkgbase-a',
        isActive: true,
        version: '1.0',
        repo: { id: 1, name: 'chaotic-aur' } as Repo,
        metadata: {
          filename: 'x',
          buildDate: '0',
          deps: ['foo', 'bar', 'qux.so.1', 'baz'],
          makeDeps: ['quux>=1.0'],
          provides: ['baz'],
        },
      },
      {
        id: 11,
        pkgname: 'pkg-b',
        isActive: true,
        version: '1.0',
        repo: { id: 1, name: 'chaotic-aur' } as Repo,
        metadata: { filename: 'x', buildDate: '0', deps: ['baz'], makeDeps: [] },
      },
    ]);

    const service = buildService(archRepo, packageRepo);
    const rows = await service.getMissingDependencies();

    expect(rows).toHaveLength(1);
    expect(rows[0].pkgname).toBe('pkg-a');
    expect(rows[0].missingDeps).toEqual(['bar']);
    expect(rows[0].missingMakeDeps).toEqual(['quux']);
  });

  it('inactive chaotic packages are ignored', async () => {
    const archRepo = createMockRepository<ArchlinuxPackage>({ keyOf: (p) => String(p.id) });
    const packageRepo = createMockRepository<Package>({ keyOf: (p) => String(p.id) });
    archRepo.seed([]);
    packageRepo.seed([
      {
        id: 20,
        pkgname: 'inactive-pkg',
        isActive: false,
        version: '1.0',
        repo: { id: 1, name: 'chaotic-aur' } as Repo,
        metadata: { filename: 'x', buildDate: '0', deps: ['missing-lib'], provides: [] },
      },
    ]);
    const service = buildService(archRepo, packageRepo);
    const rows = await service.getMissingDependencies();
    expect(rows).toHaveLength(0);
  });
});

describe('RepoManagerService.getArchOverlap', () => {
  it('matches pkgname exactly, ignores provides/pkgbaseName and deactivated arch', async () => {
    const archRepo = createMockRepository<ArchlinuxPackage>({ keyOf: (p) => String(p.id) });
    const packageRepo = createMockRepository<Package>({ keyOf: (p) => String(p.id) });

    archRepo.seed([
      {
        id: 1,
        pkgname: 'arch-pkg',
        deactivatedAt: null,
        version: '2.0',
        metadata: { filename: 'x', buildDate: '0', provides: ['virt=1.0'] },
      },
      {
        id: 2,
        pkgname: 'old-arch',
        deactivatedAt: new Date(),
        version: '1.0',
        metadata: { filename: 'x', buildDate: '0' },
      },
      { id: 3, pkgname: 'libfoo', deactivatedAt: null, version: '1.0', metadata: { filename: 'x', buildDate: '0' } },
      {
        id: 4,
        pkgname: 'cosmic-screenshot',
        deactivatedAt: null,
        version: '1:1.7.0',
        metadata: { filename: 'x', buildDate: '0' },
      },
    ]);
    packageRepo.seed([
      {
        id: 10,
        pkgname: 'arch-pkg',
        isActive: true,
        version: '1.0',
        repo: { id: 1, name: 'chaotic-aur' } as Repo,
        metadata: { filename: 'x', buildDate: '0' },
      },
      {
        id: 11,
        pkgname: 'chaotic-virt',
        isActive: true,
        version: '1.0',
        repo: { id: 1, name: 'chaotic-aur' } as Repo,
        metadata: { filename: 'x', buildDate: '0', provides: ['virt'] },
      },
      {
        id: 12,
        pkgname: 'old-arch',
        isActive: true,
        version: '1.0',
        repo: { id: 1, name: 'chaotic-aur' } as Repo,
        metadata: { filename: 'x', buildDate: '0' },
      },
      {
        id: 13,
        pkgname: 'pkgbase-consumer',
        pkgbaseName: 'libfoo',
        isActive: true,
        version: '1.0',
        repo: { id: 1, name: 'chaotic-aur' } as Repo,
        metadata: { filename: 'x', buildDate: '0' },
      },
      {
        id: 14,
        pkgname: 'no-overlap',
        isActive: true,
        version: '1.0',
        repo: { id: 1, name: 'chaotic-aur' } as Repo,
        metadata: { filename: 'x', buildDate: '0' },
      },
      {
        id: 15,
        pkgname: 'cosmic-screenshot-git',
        isActive: true,
        version: '1.6.0',
        repo: { id: 1, name: 'chaotic-aur' } as Repo,
        metadata: { filename: 'x', buildDate: '0', provides: ['cosmic-screenshot=1.7.0'] },
      },
    ]);

    const service = buildService(archRepo, packageRepo);
    const rows = await service.getArchOverlap();

    const names = rows.map((r) => r.pkgname);
    expect(names).toEqual(['arch-pkg']);
    expect(names).not.toContain('chaotic-virt');
    expect(names).not.toContain('pkgbase-consumer');
    expect(names).not.toContain('old-arch');
    expect(names).not.toContain('no-overlap');
    expect(names).not.toContain('cosmic-screenshot-git');
  });
});
