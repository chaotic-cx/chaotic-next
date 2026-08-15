import { ConfigService } from '@nestjs/config';
import { encryptAes } from '../../utils/functions';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Repo } from '../../builder/builder.entity';
import { GitlabRepoReaderFactory } from './repo-reader';

const execFileP = promisify(execFile);
const DB_KEY = 'test-db-key';

const { showArchiveMock, resetGitlabMock, gitlabMock } = vi.hoisted(() => {
  const showArchiveMock = vi.fn();
  const fakeApi = function () {
    return { Repositories: { showArchive: showArchiveMock } };
  };
  const gitlabMock = vi.fn().mockImplementation(fakeApi);
  const resetGitlabMock = (): void => {
    gitlabMock.mockReset().mockImplementation(fakeApi);
  };
  return { showArchiveMock, resetGitlabMock, gitlabMock };
});

vi.mock('@gitbeaker/rest', () => ({ Gitlab: gitlabMock }));

async function makeTarball(files: Record<string, string>): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'reader-fixture-'));
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = join(dir, relativePath);
    await mkdir(join(fullPath, '..'), { recursive: true });
    await writeFile(fullPath, content);
  }
  const archive = join(tmpdir(), `reader-archive-${Date.now()}-${Math.random().toString(36).slice(2)}.tar.gz`);
  await execFileP('tar', ['-czf', archive, '-C', dir, ...Object.keys(files)]);
  const buffer = await readFile(archive);
  await Promise.all([rm(dir, { recursive: true, force: true }), rm(archive, { force: true })]);
  return buffer;
}

function makeFactory(): GitlabRepoReaderFactory {
  return new GitlabRepoReaderFactory({ getOrThrow: () => DB_KEY } as unknown as ConfigService);
}

function makeRepo(overrides: Partial<Repo> = {}): Repo {
  return {
    name: 'chaotic-aur',
    gitlabProjectId: 'chaotic-aur/pkgbuilds',
    gitRef: 'main',
    apiToken: encryptAes('secret-token', DB_KEY),
    ...overrides,
  } as Repo;
}

describe('GitlabRepoReaderFactory', () => {
  beforeEach(() => {
    showArchiveMock.mockReset();
    resetGitlabMock();
  });

  it('downloads the archive and serves the package dirs and .CI/config contents', async () => {
    const tarball = await makeTarball({
      'pkgbuilds-main/.ci/config': 'CI_REBUILD_TRIGGERS=glibc',
      'pkgbuilds-main/firefox/.CI/config': 'CI_PACKAGE_BUMP=130.0-1/1\n',
      'pkgbuilds-main/wine/.CI/config': 'CI_PACKAGE_BUMP=9.0-1/3\n',
    });
    showArchiveMock.mockResolvedValue(new Blob([new Uint8Array(tarball)]));

    const reader = await makeFactory().open(makeRepo());

    expect(gitlabMock).toHaveBeenCalledWith({ token: 'secret-token' });
    expect(showArchiveMock).toHaveBeenCalledWith('chaotic-aur/pkgbuilds', { sha: 'main', fileType: 'tar.gz' });
    expect(await reader.listPackageDirs()).toEqual(expect.arrayContaining(['firefox', 'wine']));
    expect(await reader.readFile('firefox/.CI/config')).toBe('CI_PACKAGE_BUMP=130.0-1/1\n');
    expect(await reader.readFile('.ci/config')).toBe('CI_REBUILD_TRIGGERS=glibc');
    expect(await reader.readFile('does-not-exist/.CI/config')).toBe('');

    await reader.dispose();
  });

  it('throws when the repo has no gitlabProjectId', async () => {
    await expect(makeFactory().open(makeRepo({ gitlabProjectId: undefined }))).rejects.toThrow(/gitlabProjectId/);
    expect(showArchiveMock).not.toHaveBeenCalled();
  });
});
