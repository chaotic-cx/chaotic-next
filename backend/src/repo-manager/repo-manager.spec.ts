import { HttpService } from '@nestjs/axios';
import { RepoStatus } from '@chaotic-next/shared-lib';
import type { Repository } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import type { Package, Repo } from '../builder/builder.entity';
import { TriggerType, type RepoSettings } from '../interfaces/repo-manager';
import { BumpService } from './bump';
import { ArchMirrorService } from './arch-mirror.service';
import { ChaoticIndexService } from './chaotic-index.service';
import { RepoManager } from './repo-manager';
import type { RepoReader, RepoReaderFactory } from './repo-rw';
import { RebuildTriggerService, SignalScanService } from './scan';

const SETTINGS: RepoSettings = { regenDatabase: false, abiDryRun: true };

function repo(name: string): Repo {
  return { name, gitlabProjectId: 1 } as unknown as Repo;
}

interface StartRunStubs {
  readerFactory: RepoReaderFactory;
  triggers: RebuildTriggerService;
  bump: BumpService;
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
    bumpPackages: vi.fn(async () => []),
    bumpAndPush: vi.fn(async () => []),
    pushChanges: vi.fn(async () => undefined),
  } as unknown as BumpService;

  const repoManager = new RepoManager(
    SETTINGS,
    {} as HttpService,
    readerFactory,
    {} as SignalScanService,
    {} as Repository<Package>,
    {} as ArchMirrorService,
    {} as ChaoticIndexService,
    stubs.triggers ?? triggers,
    stubs.bump ?? bump,
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
