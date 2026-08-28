import { PipelineOperation } from '@chaotic-next/shared-lib';
import { type PinoLogger } from 'nestjs-pino';
import type { Repository } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { AurScanService } from '../diff-scan/aur-scan.service';
import { Package } from '../builder/builder.entity';
import { GitlabApiService } from './gitlab-api.service';
import { GitlabPackageOpsService } from './gitlab-package-ops.service';
import { GitlabPipelineService } from './gitlab-pipeline.service';
import { PipelineTrigger } from './pipeline-trigger.entity';

const ACTOR = { userId: 'test-user', userName: 'Test User' };

function createService(
  apiObject: Record<string, unknown> = {},
  packageRepository?: { findOne: ReturnType<typeof vi.fn> },
): {
  service: GitlabPackageOpsService;
  apiService: GitlabApiService;
  pipelineTriggerRepository: { insert: ReturnType<typeof vi.fn> };
  packageRepository: { findOne: ReturnType<typeof vi.fn> };
} {
  const pipelineTriggerRepository = { insert: vi.fn() };
  const packages = packageRepository ?? { findOne: vi.fn().mockResolvedValue({ version: '1.0', pkgrel: 1 }) };

  const apiService = new GitlabApiService(
    {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      debug: () => undefined,
    } as unknown as PinoLogger,
    { get: vi.fn(), getOrThrow: vi.fn().mockReturnValue(12345) } as never,
    { findOne: vi.fn().mockResolvedValue({ gitlabProjectId: 'test-project-id' }) } as unknown as Repository<never>,
  );
  (apiService as unknown as { chaoticId: string }).chaoticId = 'test-project-id';
  (apiService as unknown as { api: unknown }).api = apiObject;

  const service = new GitlabPackageOpsService(
    {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      debug: () => undefined,
    } as unknown as PinoLogger,
    apiService,
    { registerCommitSha: vi.fn() } as unknown as GitlabPipelineService,
    { startScan: vi.fn().mockResolvedValue({ packageBase: 'paru' }) } as unknown as AurScanService,
    pipelineTriggerRepository as unknown as Repository<PipelineTrigger>,
    packages as unknown as Repository<Package>,
  );
  return { service, apiService, pipelineTriggerRepository, packageRepository: packages };
}

describe('GitlabPackageOpsService', () => {
  it('creates bump commit via Commits.create for operation Bump Packages', async () => {
    const { service, apiService, pipelineTriggerRepository } = createService();
    const createCommit = vi.fn().mockResolvedValue({ id: 'bump123', web_url: 'https://gitlab.com/commit/bump123' });
    const showRaw = vi.fn().mockResolvedValue('CI_PACKAGE_BUMP=1.0-1/1\n');
    (apiService as unknown as { api: unknown }).api = {
      Commits: { create: createCommit },
      RepositoryFiles: { showRaw },
    };

    const result = await service.bumpPackages(['nodejs'], 'chaotic-aur', 'main', ACTOR);

    expect(showRaw).toHaveBeenCalledWith('test-project-id', 'nodejs/.CI/config', 'main');
    expect(createCommit).toHaveBeenCalledWith(
      'test-project-id',
      'main',
      'chore(bump): nodejs\n\nBumped manually by Test User',
      [
        {
          action: 'update',
          filePath: 'nodejs/.CI/config',
          content: 'CI_PACKAGE_BUMP=1.0-1/2\n',
        },
      ],
    );
    expect(result).toEqual({
      pipelineId: 0,
      webUrl: 'https://gitlab.com/commit/bump123',
      status: 'committed',
    });
    expect(pipelineTriggerRepository.insert).toHaveBeenCalledWith({
      ref: 'main',
      commitSha: 'bump123',
      operation: PipelineOperation.BUMP_PACKAGES,
      inputs: { packages: 'nodejs' },
      pipelineId: null,
      webUrl: 'https://gitlab.com/commit/bump123',
      ...ACTOR,
    });
  });

  it('throws NotFoundException when bumping non-existent package', async () => {
    const { service } = createService({}, { findOne: vi.fn().mockResolvedValue(null) });

    await expect(service.bumpPackages(['nonexistent'], 'chaotic-aur', 'main', ACTOR)).rejects.toThrow(
      "Package 'nonexistent' not found",
    );
  });

  it('deletes package directories via Commits.create for operation Drop Packages', async () => {
    const { service, apiService, pipelineTriggerRepository } = createService();
    const createCommit = vi.fn().mockResolvedValue({ id: 'commit123', web_url: 'https://gitlab.com/commit/123' });
    const allRepositoryTrees = vi.fn().mockImplementation((projectId: string, options: { path: string }) =>
      Promise.resolve([
        { type: 'blob', path: `${options.path}/.CI/config` },
        { type: 'blob', path: `${options.path}/PKGBUILD` },
      ]),
    );
    (apiService as unknown as { api: unknown }).api = {
      Commits: { create: createCommit },
      Repositories: { allRepositoryTrees },
    };

    const result = await service.dropPackages(['paru', 'zen-browser'], 'chaotic-aur', 'main', ACTOR);

    expect(createCommit).toHaveBeenCalledWith(
      'test-project-id',
      'main',
      'chore(drop): paru, zen-browser\n\nDropped manually by Test User',
      [
        { action: 'delete', filePath: 'paru/.CI/config' },
        { action: 'delete', filePath: 'paru/PKGBUILD' },
        { action: 'delete', filePath: 'zen-browser/.CI/config' },
        { action: 'delete', filePath: 'zen-browser/PKGBUILD' },
      ],
    );
    expect(result).toEqual({
      pipelineId: 0,
      webUrl: 'https://gitlab.com/commit/123',
      status: 'committed',
    });
    expect(pipelineTriggerRepository.insert).toHaveBeenCalledWith({
      ref: 'main',
      commitSha: 'commit123',
      operation: PipelineOperation.DROP_PACKAGES,
      inputs: { packages: 'paru:zen-browser' },
      pipelineId: null,
      webUrl: 'https://gitlab.com/commit/123',
      ...ACTOR,
    });
  });

  it('adds new package files via Commits.create for operation Add Packages', async () => {
    const { service, apiService, pipelineTriggerRepository } = createService();
    const createCommit = vi.fn().mockResolvedValue({ id: 'commit456', web_url: 'https://gitlab.com/commit/456' });
    (apiService as unknown as { api: unknown }).api = {
      Commits: { create: createCommit },
    };

    const result = await service.addPackages(
      [{ pkgname: 'paru', source: 'aur' }],
      'chaotic-aur',
      'github/5678',
      'main',
      ACTOR,
    );

    expect(createCommit).toHaveBeenCalled();
    expect(result.status).toBe('committed');
    expect(pipelineTriggerRepository.insert).toHaveBeenCalledWith({
      ref: 'main',
      commitSha: 'commit456',
      operation: PipelineOperation.ADD_PACKAGES,
      inputs: { add_packages: 'paru', request_origin: 'github/5678' },
      pipelineId: null,
      webUrl: 'https://gitlab.com/commit/456',
      ...ACTOR,
    });
  });
});
