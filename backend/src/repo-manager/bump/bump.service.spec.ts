import { PinoLogger } from 'nestjs-pino';
import type { Repository } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { Package, Repo } from '../../builder/builder.entity';
import type { EntityLookupService } from '../../builder/entity-lookup.service';
import { BumpType, type RepoUpdateRunParams, TriggerType } from '../../interfaces/repo-manager';
import { ArchlinuxPackage, PackageBump, PackageElfAnalysis } from '../repo-manager.entity';
import type { RepoReader, RepoWriter } from '../repo-rw';
import { BumpService } from './bump.service';

const CHANGED_AT = new Date('2026-10-01T10:30:00Z');

const pinoStub = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() } as unknown as PinoLogger;

function buildService(manager: Record<string, unknown>, repoWriter: Partial<RepoWriter> = {}): BumpService {
  const packagesRepository = { manager } as unknown as Repository<Package>;
  const lookup = {
    getOrCreatePackage: vi.fn(async () => ({ version: '1.0', pkgrel: 1 })),
  } as unknown as EntityLookupService;
  return new BumpService(
    packagesRepository,
    {} as Repository<PackageElfAnalysis>,
    repoWriter as RepoWriter,
    lookup,
    pinoStub,
  );
}

function entry(pkgId: number, triggerFrom = TriggerType.ARCH, archPkgId = 10): RepoUpdateRunParams {
  const archPkg = Object.assign(new ArchlinuxPackage(), { id: archPkgId, pkgname: 'clang', lastUpdated: CHANGED_AT });
  return {
    archPkg,
    bumpType: BumpType.BROKEN_DEPS,
    configs: {},
    pkg: { id: pkgId, pkgname: `pkg-${pkgId}`, repo: {} as Repo } as Package,
    triggerFrom,
  };
}

function bumpRow(pkgId: number, timestamp: Date): PackageBump {
  return { id: pkgId * 100, trigger: 10, timestamp, pkg: { id: pkgId } } as PackageBump;
}

describe('BumpService.dropAlreadyBumpedForArch', () => {
  it('drops a rebuild already bumped for the same change of the same Arch package', async () => {
    const find = vi.fn(async () => [bumpRow(1, new Date('2026-10-01T11:00:00Z'))]);
    const service = buildService({ find });

    const result = await service.dropAlreadyBumpedForArch([entry(1), entry(2)]);

    expect(result.map((param) => param.pkg.id)).toEqual([2]);
  });

  it('drops a rebuild when the earlier bump of the same change blamed another Arch package', async () => {
    const find = vi.fn(async () => [bumpRow(1, new Date('2026-10-01T11:00:00Z'))]);
    const service = buildService({ find });

    const result = await service.dropAlreadyBumpedForArch([entry(1, TriggerType.ARCH, 11)]);

    expect(result).toHaveLength(0);
  });

  it('keeps a rebuild when the earlier bump belongs to an older change', async () => {
    const find = vi.fn(async () => [bumpRow(1, new Date('2026-09-01T00:00:00Z'))]);
    const service = buildService({ find });

    const result = await service.dropAlreadyBumpedForArch([entry(1)]);

    expect(result).toHaveLength(1);
  });

  it('does not query for chaotic-triggered rebuilds', async () => {
    const find = vi.fn();
    const service = buildService({ find });

    const result = await service.dropAlreadyBumpedForArch([entry(1, TriggerType.CHAOTIC)]);

    expect(find).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
  });
});

describe('BumpService.bumpAndPush', () => {
  function bumpManager(): { manager: Record<string, unknown>; saveRow: ReturnType<typeof vi.fn> } {
    const saveRow = vi.fn(async (target: unknown, row: object) => row);
    const manager = {
      transaction: vi.fn(async (work: (m: unknown) => Promise<void>) => work({ save: saveRow })),
    };
    return { manager, saveRow };
  }

  const reader = { readFile: vi.fn(async () => 'CI_PKGREL=1\n') } as unknown as RepoReader;

  it('saves no bump record when the push fails, so a retry bumps again', async () => {
    const { manager, saveRow } = bumpManager();
    const service = buildService(manager, { commitBumps: vi.fn(async () => Promise.reject(new Error('push failed'))) });

    await expect(service.bumpAndPush([entry(1)], reader, {} as Repo)).rejects.toThrow('push failed');

    expect(saveRow).not.toHaveBeenCalled();
  });

  it('saves no bump record when preparing a later bump fails', async () => {
    const { manager, saveRow } = bumpManager();
    const commitBumps = vi.fn(async () => undefined);
    const service = buildService(manager, { commitBumps });
    const failingReader = {
      readFile: vi.fn().mockResolvedValueOnce('CI_PKGREL=1\n').mockRejectedValueOnce(new Error('no .CI/config')),
    } as unknown as RepoReader;

    await expect(service.bumpAndPush([entry(1), entry(2)], failingReader, {} as Repo)).rejects.toThrow('no .CI/config');

    expect(commitBumps).not.toHaveBeenCalled();
    expect(saveRow).not.toHaveBeenCalled();
  });

  it('saves the bump records after a successful push', async () => {
    const { manager, saveRow } = bumpManager();
    const service = buildService(manager, { commitBumps: vi.fn(async () => undefined) });

    const result = await service.bumpAndPush([entry(1)], reader, {} as Repo);

    expect(result).toHaveLength(1);
    expect(saveRow).toHaveBeenCalledWith(PackageBump, expect.objectContaining({ trigger: 10 }));
  });
});
