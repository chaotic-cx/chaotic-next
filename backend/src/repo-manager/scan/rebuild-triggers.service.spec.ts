import { type PinoLogger } from 'nestjs-pino';
import { type Repository } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { type Package, type Repo } from '../../builder/builder.entity';
import { BumpType, TriggerType, type RepoSettings } from '../../interfaces/repo-manager';
import { type BumpService } from '../bump';
import { type SignalComputeClient } from '../compute/signal-compute.client';
import { type ArchlinuxPackage } from '../repo-manager.entity';
import { type RepoReader } from '../repo-rw';
import { RebuildTriggerService } from './rebuild-triggers.service';
import { type DetectedTriggerDto } from './trigger-detector';

const repo = { id: 1, name: 'chaotic-aur' } as Repo;
const llvmLibs = { id: 30, pkgname: 'llvm-libs', version: '23.1.1-1' } as ArchlinuxPackage;
const pino = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as PinoLogger;
const reader = {} as RepoReader;

function trigger(details: string[] = ['missing soname libLLVM.so.22.1']): DetectedTriggerDto {
  return {
    bumpType: BumpType.BROKEN_DEPS,
    triggerFrom: TriggerType.ARCH,
    ownerId: 30,
    reason: 'broken dependency',
    details,
  };
}

function service(options: {
  detected: Map<string, DetectedTriggerDto>;
  configs?: Record<string, Record<string, string>>;
  skipSignalScan?: string[];
  archOwners?: ArchlinuxPackage[];
}): { triggers: RebuildTriggerService; readPackageConfig: ReturnType<typeof vi.fn> } {
  const compute = { run: vi.fn(async () => options.detected) } as unknown as SignalComputeClient;
  const readPackageConfig = vi.fn(async (configReader: unknown, { pkgbaseDir }: { pkgbaseDir: string }) => ({
    configs: options.configs?.[pkgbaseDir] ?? {},
    pkgInDb: { pkgname: pkgbaseDir, skipSignalScan: options.skipSignalScan?.includes(pkgbaseDir) ?? false } as Package,
  }));
  const triggers = new RebuildTriggerService(
    compute,
    { readPackageConfig } as unknown as BumpService,
    { find: vi.fn(async () => options.archOwners ?? [llvmLibs]) } as unknown as Repository<ArchlinuxPackage>,
    { find: vi.fn(async () => []) } as unknown as Repository<Package>,
    pino,
  );
  return { triggers, readPackageConfig };
}

const settings: RepoSettings = { regenDatabase: false, abiDryRun: false, signalScanEnabled: true };

describe('RebuildTriggerService.checkRebuildTriggers', () => {
  it('builds an entry with the loaded Arch package for a detected PKGBUILD', async () => {
    const { triggers } = service({ detected: new Map([['mesa-tkg-git', trigger()]]) });

    const entries = await triggers.checkRebuildTriggers(reader, ['mesa-tkg-git', 'other'], repo, [llvmLibs], settings);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      archPkg: llvmLibs,
      bumpType: BumpType.BROKEN_DEPS,
      pkg: { pkgname: 'mesa-tkg-git' },
    });
  });

  it('reads the config of every PKGBUILD, also of those without a trigger', async () => {
    const { triggers, readPackageConfig } = service({ detected: new Map() });

    await triggers.checkRebuildTriggers(reader, ['a', 'b', 'c'], repo, [], settings);

    expect(readPackageConfig).toHaveBeenCalledTimes(3);
  });

  it('skips binary-only packages and packages that ignore ABI rebuilds', async () => {
    const { triggers } = service({
      detected: new Map([
        ['binary-pkg', trigger()],
        ['ignoring-pkg', trigger()],
      ]),
      skipSignalScan: ['binary-pkg'],
      configs: { 'ignoring-pkg': { CI_REBUILD_IGNORE_ABI: '1' } },
    });

    expect(await triggers.checkRebuildTriggers(reader, ['binary-pkg', 'ignoring-pkg'], repo, [], settings)).toEqual([]);
  });

  it('drops a trigger whose blamed package no longer exists', async () => {
    const { triggers } = service({ detected: new Map([['mesa-tkg-git', trigger()]]), archOwners: [] });

    expect(await triggers.checkRebuildTriggers(reader, ['mesa-tkg-git'], repo, [], settings)).toEqual([]);
  });

  it('only logs the rebuilds in dry-run mode', async () => {
    const { triggers } = service({ detected: new Map([['mesa-tkg-git', trigger()]]) });

    const entries = await triggers.checkRebuildTriggers(reader, ['mesa-tkg-git'], repo, [], {
      ...settings,
      abiDryRun: true,
    });

    expect(entries).toEqual([]);
  });

  it('summarizes long details for the commit message', async () => {
    const { triggers } = service({ detected: new Map([['mesa-tkg-git', trigger(['a', 'b', 'c'])]]) });

    const [entry] = await triggers.checkRebuildTriggers(reader, ['mesa-tkg-git'], repo, [], settings);

    expect(entry.details).toEqual(['a', '... 2 more']);
  });
});
