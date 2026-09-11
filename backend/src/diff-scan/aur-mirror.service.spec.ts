import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import type { PinoLogger } from 'nestjs-pino';
import { AurMirrorService } from './aur-mirror.service';

const execFileP = promisify(execFile);

const pinoStub = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as unknown as PinoLogger;

async function git(dir: string, args: string[]): Promise<void> {
  await execFileP('git', ['-C', dir, ...args]);
}

async function makeRemote(): Promise<{ remote: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), 'aur-remote-'));
  await git(dir, ['init', '-b', 'main']);
  await git(dir, ['config', 'user.email', 'test@example.com']);
  await git(dir, ['config', 'user.name', 'test']);
  await git(dir, ['commit', '--allow-empty', '-m', 'init']);
  await git(dir, ['checkout', '-b', 'testpkg']);
  await writeFile(join(dir, 'PKGBUILD'), 'pkgname=testpkg\n');
  await writeFile(join(dir, 'helper.install'), 'post_install() {\n:\n}\n');
  await writeFile(join(dir, 'blob.bin'), Buffer.from([0x00, 0x01, 0x02, 0x00]));
  await git(dir, ['add', '.']);
  await git(dir, ['commit', '-m', 'pkg']);
  return { remote: dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

function makeService(mirrorPath: string, mirrorUrl: string): AurMirrorService {
  const configService = { get: (key: string) => (key === 'aur.mirrorPath' ? mirrorPath : mirrorUrl) };
  return new AurMirrorService(configService as never, pinoStub);
}

describe('AurMirrorService', () => {
  it('reads package files from a local clone after fetching the branch', async () => {
    const { remote, cleanup } = await makeRemote();
    const mirrorPath = join(await mkdtemp(join(tmpdir(), 'aur-mirror-')), 'mirror.git');
    const service = makeService(mirrorPath, remote);
    try {
      await service.onModuleInit();

      const pkgbuild = await service.readTextFile('testpkg', 'PKGBUILD');
      expect(pkgbuild).toEqual({ content: 'pkgname=testpkg\n' });

      const files = await service.readPackageFiles('testpkg');
      expect(files?.files.map((file) => file.name).sort()).toEqual(['PKGBUILD', 'helper.install']);
      expect(files?.skippedBinaryFiles).toEqual(['blob.bin']);
    } finally {
      await cleanup();
      await rm(mirrorPath, { recursive: true, force: true });
    }
  });

  it('returns undefined for unknown branches and unsafe input', async () => {
    const { remote, cleanup } = await makeRemote();
    const mirrorPath = join(await mkdtemp(join(tmpdir(), 'aur-mirror-')), 'mirror.git');
    const service = makeService(mirrorPath, remote);
    try {
      await service.onModuleInit();

      expect(await service.readTextFile('nosuchpkg', 'PKGBUILD')).toBeUndefined();
      expect(await service.readPackageFiles('nosuchpkg')).toBeUndefined();
      expect(await service.readTextFile('testpkg', '../evil')).toBeUndefined();
      expect(await service.readTextFile('evil;rm -rf', 'PKGBUILD')).toBeUndefined();
    } finally {
      await cleanup();
      await rm(mirrorPath, { recursive: true, force: true });
    }
  });

  it('syncs without throwing when the remote is gone', async () => {
    const mirrorPath = join(await mkdtemp(join(tmpdir(), 'aur-mirror-')), 'mirror.git');
    const service = makeService(mirrorPath, join(tmpdir(), 'aur-missing-remote'));
    await service.onModuleInit();
    await expect(service.sync()).resolves.toBeUndefined();
    await rm(mirrorPath, { recursive: true, force: true });
  });
});
