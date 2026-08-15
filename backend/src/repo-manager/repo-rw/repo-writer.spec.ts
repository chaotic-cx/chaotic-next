import { ConfigService } from '@nestjs/config';
import { encryptAes } from '../../utils/functions';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Repo } from '../../builder/builder.entity';
import { BumpType } from '../../interfaces/repo-manager';
import { type BumpCommitAction, GitlabRepoWriter } from './repo-writer';

const DB_KEY = 'test-db-key';

const { createMock, resetGitlabMock, gitlabMock } = vi.hoisted(() => {
  const createMock = vi.fn().mockResolvedValue(undefined);
  const fakeApi = function () {
    return { Commits: { create: createMock } };
  };
  const gitlabMock = vi.fn().mockImplementation(fakeApi);
  const resetGitlabMock = (): void => {
    gitlabMock.mockReset().mockImplementation(fakeApi);
  };
  return { createMock, resetGitlabMock, gitlabMock };
});

vi.mock('@gitbeaker/rest', () => ({ Gitlab: gitlabMock }));

function makeRepo(overrides: Partial<Repo> = {}): Repo {
  return {
    name: 'chaotic-aur',
    gitRef: 'main',
    gitlabProjectId: '42',
    apiToken: encryptAes('secret-token', DB_KEY),
    ...overrides,
  } as Repo;
}

function makeConfigService(): ConfigService {
  return { getOrThrow: vi.fn().mockReturnValue(DB_KEY) } as unknown as ConfigService;
}

function action(overrides: Partial<BumpCommitAction> = {}): BumpCommitAction {
  return {
    pkgname: 'firefox',
    content: 'CI_PACKAGE_BUMP=140.0-1/2\n',
    bumpType: BumpType.BROKEN_DEPS,
    details: ['libfoo.so.6 missing'],
    ...overrides,
  };
}

describe('GitlabRepoWriter', () => {
  let writer: GitlabRepoWriter;

  beforeEach(() => {
    createMock.mockReset().mockResolvedValue(undefined);
    resetGitlabMock();
    writer = new GitlabRepoWriter(makeConfigService());
  });

  it('creates one commit with an update action per package on the repo branch', async () => {
    const repo = makeRepo();

    await writer.commitBumps(repo, [action()]);

    expect(gitlabMock).toHaveBeenCalledWith({ token: 'secret-token' });
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledWith('42', 'main', expect.any(String), [
      { action: 'update', filePath: 'firefox/.CI/config', content: 'CI_PACKAGE_BUMP=140.0-1/2\n' },
    ]);
  });

  it('uses the per-package names in the subject and the signal reasons in the body', async () => {
    await writer.commitBumps(makeRepo(), [
      action({ pkgname: 'firefox', bumpType: BumpType.BROKEN_DEPS, details: ['libfoo.so.6 missing'] }),
      action({ pkgname: 'wine', bumpType: BumpType.PLUGIN, details: ['vtable _ZTV... slot 7 shifted'] }),
    ]);

    const message = createMock.mock.calls[0][2] as string;
    const [subject, body] = message.split('\n\n');
    expect(subject).toBe('chore(bump): firefox, wine');
    expect(body).toContain('- firefox: broken dependency (libfoo.so.6 missing)');
    expect(body).toContain('- wine: plugin ABI break (vtable _ZTV... slot 7 shifted)');
  });

  it('collapses the subject to packages (N) when there are more than three', async () => {
    const actions = ['a', 'b', 'c', 'd'].map((n) => action({ pkgname: n }));

    await writer.commitBumps(makeRepo(), actions);

    const subject = (createMock.mock.calls[0][2] as string).split('\n\n')[0];
    expect(subject).toBe('chore(bump): packages (4)');
  });

  it('falls back to the main ref when gitRef is unset', async () => {
    await writer.commitBumps(makeRepo({ gitRef: undefined }), [action()]);

    expect(createMock.mock.calls[0][1]).toBe('main');
  });

  it('is a no-op when there are no actions', async () => {
    await writer.commitBumps(makeRepo(), []);

    expect(gitlabMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('throws when the repo has no gitlabProjectId', async () => {
    await expect(writer.commitBumps(makeRepo({ gitlabProjectId: undefined }), [action()])).rejects.toThrow(
      /gitlabProjectId/,
    );
    expect(createMock).not.toHaveBeenCalled();
  });
});
