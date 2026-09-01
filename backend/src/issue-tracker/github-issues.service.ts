import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { type Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { cachedResult } from '../utils/cache';

/**
 * Label names mirror the existing set on chaotic-aur/packages so the bot
 * reuses established labels instead of inventing new ones.
 */
export const NEEDS_INPUT_LABEL = 'waiting:issuer-feedback';
/** Label name used before the bot switched to the upstream label set; kept for cleanup. */
export const LEGACY_NEEDS_INPUT_LABEL = 'needs-input';
export const DUPLICATE_LABEL = 'invalid:duplicate';
export const OFFICIAL_REPO_LABEL = 'info:official-repo';
export const LIBRARY_EOL_LABEL = 'info:library-eol';
export const CUSTOM_PACKAGE_LABEL = 'info:custom';
export const TEMPLATE_VIOLATION_LABEL = 'invalid:violate-issue-template';
export const NEEDS_TRIAGE_LABEL = 'needs-triage';
/** Adding this label queues a live test build of the issue's pkgbase. */
export const BUILD_TEST_LABEL = 'build:test';

const GITHUB_API_BASE_URL = 'https://api.github.com';
const ISSUE_LIST_PER_PAGE = 100;
const NO_CONTENT_STATUS = 204;
const NOT_FOUND_STATUS = 404;
const DUPLICATE_SEARCH_LIMIT = 5;
const SWEEP_SEARCH_LIMIT = 100;
const AUR_INFO_CACHE_TTL_MS = 300_000;
const AUR_INFO_TIMEOUT_MS = 5_000;
const BOT_LOGIN_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface IssueCommentRef {
  user: { login: string } | null;
  created_at: string;
}

export interface IssueRef {
  number: number;
  title: string;
}

/**
 * Thin wrapper around the GitHub Issues API for the chaotic-aur/packages
 * tracker, plus the AUR pkgbase existence lookup used during triage.
 */
@Injectable()
export class GithubIssuesService {
  private readonly token: string;
  private readonly owner: string;
  private readonly repo: string;

  constructor(
    configService: ConfigService,
    @InjectPinoLogger(GithubIssuesService.name) private readonly pino: PinoLogger,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {
    this.owner = configService.get<string>('GITHUB_ISSUES_REPO_OWNER') ?? 'chaotic-aur';
    this.repo = configService.get<string>('GITHUB_ISSUES_REPO_NAME') ?? 'packages';
    this.token = configService.getOrThrow<string>('GITHUB_TOKEN');
  }

  async createComment(issueNumber: number, body: string): Promise<void> {
    await this.request(`/repos/${this.owner}/${this.repo}/issues/${issueNumber}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
  }

  async addLabels(issueNumber: number, labels: string[]): Promise<void> {
    await this.request(`/repos/${this.owner}/${this.repo}/issues/${issueNumber}/labels`, {
      method: 'POST',
      body: JSON.stringify({ labels }),
    });
  }

  /** Removing an absent label is the desired end state; GitHub answers 404, which is swallowed. */
  async removeLabel(issueNumber: number, label: string): Promise<void> {
    try {
      await this.request(
        `/repos/${this.owner}/${this.repo}/issues/${issueNumber}/labels/${encodeURIComponent(label)}`,
        {
          method: 'DELETE',
        },
      );
    } catch (err: unknown) {
      if ((err as { status?: number }).status !== NOT_FOUND_STATUS) throw err;
    }
  }

  async closeIssue(issueNumber: number): Promise<void> {
    await this.request(`/repos/${this.owner}/${this.repo}/issues/${issueNumber}`, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'closed' }),
    });
  }

  async getIssue(issueNumber: number): Promise<{ title: string; body: string; user: string | null } | null> {
    try {
      const data = await this.request<{ title: string; body?: string | null; user?: { login: string } | null }>(
        `/repos/${this.owner}/${this.repo}/issues/${issueNumber}`,
      );
      return { title: data.title, body: data.body ?? '', user: data.user?.login ?? null };
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === NOT_FOUND_STATUS) return null;
      throw err;
    }
  }

  async listComments(issueNumber: number): Promise<IssueCommentRef[]> {
    return this.request<IssueCommentRef[]>(
      `/repos/${this.owner}/${this.repo}/issues/${issueNumber}/comments?per_page=${ISSUE_LIST_PER_PAGE}`,
    );
  }

  async findOpenRequestIssues(pkgbase: string): Promise<IssueRef[]> {
    return this.searchOpenIssues(
      `repo:${this.owner}/${this.repo} is:issue is:open in:title "${pkgbase}"`,
      DUPLICATE_SEARCH_LIMIT,
    );
  }

  async findOpenIssuesLabeled(label: string): Promise<IssueRef[]> {
    return this.searchOpenIssues(
      `repo:${this.owner}/${this.repo} is:issue is:open label:"${label}"`,
      SWEEP_SEARCH_LIMIT,
    );
  }

  private async searchOpenIssues(query: string, perPage: number): Promise<IssueRef[]> {
    const data = await this.request<{ items: { number: number; title: string }[] }>(
      `/search/issues?q=${encodeURIComponent(query)}&per_page=${perPage}`,
    );
    return data.items.map((item) => ({ number: item.number, title: item.title }));
  }

  /** Login of the account behind GITHUB_TOKEN; the sweep anchors the grace period on its comments. */
  async getBotLogin(): Promise<string | null> {
    return cachedResult(this.cache, 'issue-tracker:bot-login', BOT_LOGIN_CACHE_TTL_MS, async () => {
      try {
        const data = await this.request<{ login: string }>('/user');
        return data.login;
      } catch (err) {
        this.pino.warn({ err }, 'Could not resolve the authenticated GitHub user');
        return null;
      }
    });
  }

  private async request<T>(path: string, init?: { method?: string; body?: string }): Promise<T> {
    const response = await fetch(`${GITHUB_API_BASE_URL}${path}`, {
      method: init?.method,
      body: init?.body,
      headers: {
        'accept': 'application/vnd.github+json',
        'authorization': `Bearer ${this.token}`,
        'content-type': 'application/json',
      },
    });
    if (!response.ok) {
      const err: Error & { status: number } = Object.assign(
        new Error(`GitHub API ${init?.method ?? 'GET'} ${path} failed with status ${response.status}`),
        { status: response.status },
      );
      throw err;
    }
    if (response.status === NO_CONTENT_STATUS) return undefined as T;
    return (await response.json()) as T;
  }

  /**
   * Resolves package/package-base names to their canonical AUR pkgbase via a
   * single batched RPC call. Names the AUR does not know map to null.
   */
  async resolveAurPackageBases(names: string[]): Promise<Map<string, string | null>> {
    const resolution = new Map<string, string | null>();
    const toFetch: string[] = [];
    for (const name of new Set(names.map((name) => name.toLowerCase()))) {
      const cached = await this.cache.get<string | null>(`issue-tracker:aur-base:${name}`);
      if (cached === undefined) toFetch.push(name);
      else resolution.set(name, cached);
    }
    if (toFetch.length === 0) return resolution;

    try {
      const query = toFetch.map((name) => `arg[]=${encodeURIComponent(name)}`).join('&');
      const response = await fetch(`https://aur.archlinux.org/rpc/v5/info?${query}`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(AUR_INFO_TIMEOUT_MS),
      });
      if (!response.ok) {
        this.pino.warn({ statusCode: response.status, names: toFetch }, 'AUR info returned a non-ok status');
        for (const name of toFetch) resolution.set(name, null);
        return resolution;
      }
      const data: unknown = await response.json();
      const results = (data as { results?: unknown }).results;
      const byName = new Map<string, string>();
      if (Array.isArray(results)) {
        for (const result of results) {
          const pkgName = (result as { Name?: unknown }).Name;
          const pkgBase = (result as { PackageBase?: unknown }).PackageBase;
          if (typeof pkgName === 'string' && typeof pkgBase === 'string') byName.set(pkgName.toLowerCase(), pkgBase);
        }
      }
      for (const name of toFetch) {
        const base = byName.get(name) ?? null;
        resolution.set(name, base);
        await this.cache.set(`issue-tracker:aur-base:${name}`, base, AUR_INFO_CACHE_TTL_MS);
      }
    } catch (err) {
      this.pino.warn({ err, names: toFetch }, 'AUR info lookup failed');
      for (const name of toFetch) resolution.set(name, null);
    }
    return resolution;
  }
}
