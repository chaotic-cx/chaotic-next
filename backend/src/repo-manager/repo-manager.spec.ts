import { HttpService } from '@nestjs/axios';
import { RepoStatus } from '@chaotic-next/shared-lib';
import { type PinoLogger } from 'nestjs-pino';
import type { Repository } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import type { Package, Repo } from '../builder/builder.entity';
import { BumpType, TriggerType, type RepoSettings, type RepoUpdateRunParams } from '../interfaces/repo-manager';
import { BumpService } from './bump';
import { ArchMirrorService } from './arch-mirror.service';
import { ChaoticIndexService } from './chaotic-index.service';
import { RepoManager, UNSCANNED_CHANGE_MAX_AGE_MS } from './repo-manager';
import { ArchlinuxPackage } from './repo-manager.entity';
import type { RepoReader, RepoReaderFactory } from './repo-rw';
import { RebuildTriggerService, SignalScanService } from './scan';

const pinoStub = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as unknown as PinoLogger;

const SETTINGS: RepoSettings = { regenDatabase: false, abiDryRun: true };

function repo(name: string): Repo {
  return { name, gitlabProjectId: 1 } as unknown as Repo;
}

interface StartRunStubs {
  readerFactory: RepoReaderFactory;
  triggers: RebuildTriggerService;
  bump: BumpService;
  archMirror: ArchMirrorService;
}

function buildRepoManager(stubs: Partial<StartRunStubs> = {}): {
  repoManager: RepoManager;
  checkRebuildTriggers: ReturnType<typeof vi.fn>;
} {
  const reader: RepoReader = {
    listPackageDirs: async () => ['some-package'],
    readFile: async () => '',
    dispose: async () => undefined,
  };
  const readerFactory: RepoReaderFactory = stubs.readerFactory ?? { open: vi.fn(async () => reader) };
  const checkRebuildTriggers = vi.fn(async () => []);
  const triggers = {
    checkRebuildTriggers,
    buildDeployedOwnerBreakIndex: vi.fn(),
    loadLatestChaoticAnalyses: vi.fn(),
    consumerSymbolBreaksFor: vi.fn(),
    buildRebuildEntry: vi.fn(),
  } as unknown as RebuildTriggerService;
  const bump = {
    bumpAndPush: vi.fn(async () => []),
    pushChanges: vi.fn(async () => undefined),
  } as unknown as BumpService;

  const repoManager = new RepoManager(
    SETTINGS,
    {} as HttpService,
    readerFactory,
    {} as SignalScanService,
    {} as Repository<Package>,
    stubs.archMirror ?? ({} as ArchMirrorService),
    {} as ChaoticIndexService,
    stubs.triggers ?? triggers,
    stubs.bump ?? bump,
    pinoStub,
  );
  return { repoManager, checkRebuildTriggers };
}

describe('RepoManager.startRun', () => {
  // Regression: run() holds the status lock across every startRun call; a
  // guard on `status` here used to skip all repos of the run.
  it('checks rebuild triggers even while the caller holds the run lock', async () => {
    const { repoManager, checkRebuildTriggers } = buildRepoManager();
    repoManager.status = RepoStatus.ACTIVE;

    const result = await repoManager.startRun(repo('chaotic-aur'));

    expect(checkRebuildTriggers).toHaveBeenCalledOnce();
    expect(result).toEqual({ repo: 'chaotic-aur', bumped: [], origin: TriggerType.ARCH });
  });

  it('skips repos without a GitLab project id without opening a reader', async () => {
    const open = vi.fn();
    const { repoManager, checkRebuildTriggers } = buildRepoManager({ readerFactory: { open } });

    const result = await repoManager.startRun({ name: 'orphan', gitlabProjectId: null } as unknown as Repo);

    expect(open).not.toHaveBeenCalled();
    expect(checkRebuildTriggers).not.toHaveBeenCalled();
    expect(result).toEqual({ repo: 'orphan', bumped: [], origin: TriggerType.ARCH });
  });
});

describe('RepoManager.selectScannedChanges', () => {
  const NOW = new Date('2026-10-02T12:00:00Z');

  function archPkg(id: number, changedMsAgo: number): ArchlinuxPackage {
    return Object.assign(new ArchlinuxPackage(), {
      id,
      pkgname: `arch-${id}`,
      lastUpdated: new Date(NOW.getTime() - changedMsAgo),
    });
  }

  it('keeps scanned changes and releases unscanned changes past the maximum age', async () => {
    const scanned = archPkg(1, 0);
    const recent = archPkg(2, 0);
    const expired = archPkg(3, UNSCANNED_CHANGE_MAX_AGE_MS);
    const clearTriggersPending = vi.fn(async () => undefined);
    const archMirror = {
      withCurrentAnalysis: vi.fn(async () => [scanned]),
      clearTriggersPending,
    } as unknown as ArchMirrorService;
    const { repoManager } = buildRepoManager({ archMirror });
    repoManager.changedArchPackages = [scanned, recent, expired];

    await repoManager.selectScannedChanges(NOW);

    expect(repoManager.changedArchPackages).toEqual([scanned]);
    expect(clearTriggersPending).toHaveBeenCalledWith([expired]);
  });

  it('does not release anything while every unscanned change is recent', async () => {
    const clearTriggersPending = vi.fn(async () => undefined);
    const archMirror = {
      withCurrentAnalysis: vi.fn(async () => []),
      clearTriggersPending,
    } as unknown as ArchMirrorService;
    const { repoManager } = buildRepoManager({ archMirror });
    repoManager.changedArchPackages = [archPkg(1, 0)];

    await repoManager.selectScannedChanges(NOW);

    expect(repoManager.changedArchPackages).toEqual([]);
    expect(clearTriggersPending).not.toHaveBeenCalled();
  });
});

describe('RepoManager.checkPackageDepsAfterDeployment', () => {
  const chaoticAur = { id: 1, name: 'chaotic-aur', gitlabProjectId: 1 } as unknown as Repo;
  const garuda = { id: 2, name: 'garuda', gitlabProjectId: 2 } as unknown as Repo;

  function pkg(id: number, pkgname: string, repo: Repo, overrides: Partial<Package> = {}): Package {
    return { id, pkgname, pkgbaseName: null, repo, isActive: true, bumpTriggers: null, ...overrides } as Package;
  }

  function deploymentManager(options: {
    packages: Package[];
    signalScanEnabled?: boolean;
    detected?: Map<number, unknown>;
    bumpAndPush?: (needsRebuild: RepoUpdateRunParams[], reader: unknown, repo: Repo) => Promise<unknown[]>;
  }) {
    const readers = new Map<string, RepoReader>();
    const readerFactory: RepoReaderFactory = {
      open: vi.fn(async (repo: Repo) => {
        const reader = {
          listPackageDirs: async () => [],
          readFile: async () => '',
          dispose: vi.fn(async () => undefined),
        };
        readers.set(repo.name, reader);
        return reader;
      }),
    };
    const triggers = {
      deploymentTriggers: vi.fn(async () => options.detected ?? new Map()),
      buildRebuildEntry: vi.fn((params: { pkgConfig: { pkgInDb: Package } }) => ({
        ...params,
        pkg: params.pkgConfig.pkgInDb,
      })),
    } as unknown as RebuildTriggerService;
    const bump = {
      readPackageConfig: vi.fn(async (reader: unknown, opts: { pkgbaseDir: string; pkgInDb?: Package }) => ({
        configs: {},
        pkgInDb: opts.pkgInDb ?? ({ pkgname: opts.pkgbaseDir, skipSignalScan: false } as Package),
      })),
      bumpAndPush: vi.fn(options.bumpAndPush ?? (async (needsRebuild: RepoUpdateRunParams[]) => needsRebuild)),
    } as unknown as BumpService;
    const signalScan = {
      scanPackages: vi.fn(),
      recomputeBroken: vi.fn(async () => undefined),
    } as unknown as SignalScanService;
    const repoManager = new RepoManager(
      { regenDatabase: false, abiDryRun: false, signalScanEnabled: options.signalScanEnabled ?? false },
      {} as HttpService,
      readerFactory,
      signalScan,
      { find: vi.fn(async () => options.packages) } as unknown as Repository<Package>,
      { cleanUp: vi.fn() } as unknown as ArchMirrorService,
      {} as ChaoticIndexService,
      triggers,
      bump,
      pinoStub,
    );
    return { repoManager, triggers, bump, readerFactory };
  }

  function bumpedNames(bump: BumpService): string[][] {
    return vi
      .mocked(bump.bumpAndPush)
      .mock.calls.map(([needsRebuild]) => needsRebuild.map((entry) => entry.pkg.pkgname));
  }

  it('bumps an explicit trigger in the repo of the consumer, through the reader of that repo', async () => {
    const deployed = pkg(1, 'hyprlang-git', chaoticAur);
    const consumer = pkg(2, 'hyprland-plugin', garuda, {
      bumpTriggers: [{ pkgname: 'hyprlang-git', archVersion: '' }],
    });
    const { repoManager, bump, readerFactory } = deploymentManager({ packages: [deployed, consumer] });

    const results = await repoManager.checkPackageDepsAfterDeployment({ repo: chaoticAur, pkgbase: deployed });

    expect(readerFactory.open).toHaveBeenCalledWith(garuda);
    expect(results.map((result) => result.repo)).toEqual(['garuda']);
    expect(vi.mocked(bump.bumpAndPush).mock.calls[0][0][0]).toMatchObject({ bumpType: BumpType.EXPLICIT });
    expect(vi.mocked(bump.bumpAndPush).mock.calls[0][2]).toBe(garuda);
  });

  it('checks every output of the deployed PKGBUILD and bumps a split consumer once, by its PKGBUILD', async () => {
    const deployed = pkg(1, 'llvm-git', chaoticAur);
    const deployedLibs = pkg(2, 'llvm-libs-git', chaoticAur, { pkgbaseName: 'llvm-git' });
    const consumer = pkg(3, 'mesa-tkg-git', chaoticAur);
    const consumerLib32 = pkg(4, 'lib32-mesa-tkg-git', chaoticAur, { pkgbaseName: 'mesa-tkg-git' });
    const trigger = {
      bumpType: BumpType.BROKEN_DEPS,
      archPkg: deployedLibs,
      triggerFrom: TriggerType.CHAOTIC,
      reason: 'broken dependency',
      details: [],
    };
    const { repoManager, triggers, bump } = deploymentManager({
      packages: [deployed, deployedLibs, consumer, consumerLib32],
      signalScanEnabled: true,
      detected: new Map([
        [3, trigger],
        [4, trigger],
      ]),
    });

    await repoManager.checkPackageDepsAfterDeployment({ repo: chaoticAur, pkgbase: deployed });

    const [deployedArg, consumersArg] = vi.mocked(triggers.deploymentTriggers).mock.calls[0];
    expect(deployedArg.map((p) => p.pkgname)).toEqual(['llvm-git', 'llvm-libs-git']);
    expect(consumersArg.map((p) => p.pkgname)).toEqual(['mesa-tkg-git', 'lib32-mesa-tkg-git']);
    expect(bumpedNames(bump)).toEqual([['mesa-tkg-git']]);
  });

  it('bumps the other repos when one repo fails, then reports the failure', async () => {
    const deployed = pkg(1, 'hyprlang-git', chaoticAur);
    const explicit = [{ pkgname: 'hyprlang-git', archVersion: '' }];
    const { repoManager, bump } = deploymentManager({
      packages: [
        deployed,
        pkg(2, 'consumer-a', chaoticAur, { bumpTriggers: explicit }),
        pkg(3, 'consumer-b', garuda, { bumpTriggers: explicit }),
      ],
      bumpAndPush: async (needsRebuild, reader, repo) => {
        if (repo.name === 'chaotic-aur') throw new Error('push rejected');
        return needsRebuild;
      },
    });

    await expect(repoManager.checkPackageDepsAfterDeployment({ repo: chaoticAur, pkgbase: deployed })).rejects.toThrow(
      'chaotic-aur',
    );
    expect(bumpedNames(bump)).toEqual([['consumer-a'], ['consumer-b']]);
  });

  it('runs a second deployment after the first one instead of skipping it', async () => {
    const deployed = pkg(1, 'hyprlang-git', chaoticAur);
    const consumer = pkg(2, 'consumer', chaoticAur, { bumpTriggers: [{ pkgname: 'hyprlang-git', archVersion: '' }] });
    let releaseFirst: () => void = () => undefined;
    const order: string[] = [];
    const { repoManager } = deploymentManager({
      packages: [deployed, consumer],
      bumpAndPush: async (needsRebuild) => {
        order.push('start');
        if (order.length === 1) await new Promise<void>((resolve) => (releaseFirst = resolve));
        order.push('end');
        return needsRebuild;
      },
    });

    const first = repoManager.checkPackageDepsAfterDeployment({ repo: chaoticAur, pkgbase: deployed });
    const second = repoManager.checkPackageDepsAfterDeployment({ repo: chaoticAur, pkgbase: deployed });
    await new Promise((resolve) => setTimeout(resolve, 10));
    releaseFirst();
    const results = await Promise.all([first, second]);

    expect(order).toEqual(['start', 'end', 'start', 'end']);
    expect(results.map((result) => result.length)).toEqual([1, 1]);
  });
});
