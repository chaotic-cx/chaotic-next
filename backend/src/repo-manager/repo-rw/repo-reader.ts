import { type Repo } from '../../builder/builder.entity';
import { decryptAes } from '../../utils/functions';
import { listPackageDirs } from '../offline/pacman-parse';
import { Gitlab } from '@gitbeaker/rest';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

export const REPO_READER_FACTORY = Symbol('REPO_READER_FACTORY');

/**
 * Read-only view of a repo's working tree. The bump flow only ever reads the
 * root directory listing and `.CI/config` / `.ci/config` files (no PKGBUILDs —
 * package metadata comes from the DB), so this is the entire surface the git
 * clone used to provide.
 */
export interface RepoReader {
  listPackageDirs(): Promise<string[]>;
  readFile(path: string): Promise<string>;
  dispose(): Promise<void>;
}

export interface RepoReaderFactory {
  open(repo: Repo): Promise<RepoReader>;
}

/**
 * `RepoReader` backed by the GitLab repository archive. `open` downloads the
 * repo tarball (`Repositories.showArchive`) and extracts it into a temp dir;
 * reads are served from there. A fresh reader is opened per run and disposed
 * afterwards, so there is no cached/stale working tree.
 */
class GitlabRepoReader implements RepoReader {
  constructor(
    private readonly tempDir: string,
    private readonly root: string,
  ) {}

  async listPackageDirs(): Promise<string[]> {
    return listPackageDirs(this.root);
  }

  async readFile(path: string): Promise<string> {
    try {
      return await readFile(join(this.root, path), 'utf8');
    } catch {
      return '';
    }
  }

  async dispose(): Promise<void> {
    await rm(this.tempDir, { recursive: true, force: true });
  }
}

@Injectable()
export class GitlabRepoReaderFactory implements RepoReaderFactory {
  constructor(private readonly configService: ConfigService) {}

  async open(repo: Repo): Promise<RepoReader> {
    if (!repo.gitlabProjectId) {
      throw new Error(`Repo ${repo.name} has no gitlabProjectId; cannot read repo tree`);
    }
    if (!repo.apiToken) {
      throw new Error(`Repo ${repo.name} has no api token; cannot read repo tree`);
    }
    const token = decryptAes(repo.apiToken, this.configService.getOrThrow<string>('app.dbKey'));
    const api = new Gitlab({ token });
    const blob = await api.Repositories.showArchive(repo.gitlabProjectId, {
      sha: repo.gitRef || 'main',
      fileType: 'tar.gz',
    });
    return this.extract(Buffer.from(await blob.arrayBuffer()));
  }

  private async extract(buffer: Buffer): Promise<GitlabRepoReader> {
    const tempDir = await mkdtemp(join(tmpdir(), 'repo-reader-'));
    const archive = join(tempDir, 'repo.tar.gz');
    try {
      await writeFile(archive, buffer);
      await execFileP('bsdtar', ['-xf', archive, '-C', tempDir]);
    } catch (err) {
      await rm(tempDir, { recursive: true, force: true });
      throw err;
    } finally {
      await rm(archive, { force: true });
    }

    // GitLab archives wrap the repo in a single leading directory (e.g.
    // `pkgbuilds-main/`); use it as the read root when present.
    const entries = await readdir(tempDir);
    const root =
      entries.length === 1 && (await stat(join(tempDir, entries[0]))).isDirectory()
        ? join(tempDir, entries[0])
        : tempDir;
    return new GitlabRepoReader(tempDir, root);
  }
}
