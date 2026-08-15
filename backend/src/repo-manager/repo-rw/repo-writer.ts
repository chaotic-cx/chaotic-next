import { Gitlab } from '@gitbeaker/rest';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { bumpTypeAdjectiveText, decryptAes } from '../../utils/functions';
import type { Repo } from '../../builder/builder.entity';
import { BumpType } from '../../interfaces/repo-manager';

export const REPO_WRITER = Symbol('REPO_WRITER');

export interface BumpCommitAction {
  pkgname: string;
  content: string;
  bumpType: BumpType;
  details?: string[];
}

export interface RepoWriter {
  commitBumps(repo: Repo, actions: BumpCommitAction[]): Promise<void>;
}

const MAX_LISTED_PACKAGES = 3;

function buildCommitMessage(actions: BumpCommitAction[]): string {
  const subject =
    actions.length > MAX_LISTED_PACKAGES
      ? `chore(bump): packages (${actions.length})`
      : `chore(bump): ${actions.map((a) => a.pkgname).join(', ')}`;
  const body = actions
    .map((a) => {
      const reason = bumpTypeAdjectiveText(a.bumpType);
      const detail = a.details?.length ? ` (${a.details.join(', ')})` : '';
      return `- ${a.pkgname}: ${reason}${detail}`;
    })
    .join('\n');
  return `${subject}\n\n${body}`;
}

/**
 * Pushes bump commits through the GitLab REST API (gitbeaker) instead of a git
 * clone+push. One atomic commit per call carries every bumped package's
 * rewritten `.CI/config`. Auth uses the per-repo `apiToken`, decrypted with the
 * app `dbKey` — the same credential the previous HTTPS push used.
 */
@Injectable()
export class GitlabRepoWriter implements RepoWriter {
  constructor(private readonly configService: ConfigService) {}

  async commitBumps(repo: Repo, actions: BumpCommitAction[]): Promise<void> {
    if (actions.length === 0) return;
    if (!repo.gitlabProjectId) {
      throw new Error(`Repo ${repo.name} has no gitlabProjectId; cannot create bump commit`);
    }

    const token = decryptAes(repo.apiToken, this.configService.getOrThrow<string>('app.dbKey'));
    const api = new Gitlab({ token });
    await api.Commits.create(
      repo.gitlabProjectId,
      repo.gitRef || 'main',
      buildCommitMessage(actions),
      actions.map((a) => ({
        action: 'update' as const,
        filePath: `${a.pkgname}/.CI/config`,
        content: a.content,
      })),
    );
  }
}
