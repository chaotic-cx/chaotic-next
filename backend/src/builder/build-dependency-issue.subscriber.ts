import { BuildStatus } from '@chaotic-next/shared-lib';
import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntitySubscriberInterface, EventSubscriber, InsertEvent, Repository } from 'typeorm';
import { Build } from './builder.entity';
import { isFailingStatus } from './unresolved-failures';

@EventSubscriber()
export class BuildDependencyIssueSubscriber implements EntitySubscriberInterface<Build>, OnModuleInit {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Build) private readonly builds: Repository<Build>,
    private readonly configService: ConfigService,
  ) {}

  private get githubOwner(): string {
    return this.configService.get<string>('GITHUB_ISSUES_REPO_OWNER') ?? 'chaotic-aur';
  }

  private get githubRepo(): string {
    return this.configService.get<string>('GITHUB_ISSUES_REPO_NAME') ?? 'packages';
  }

  private get githubToken(): string {
    return this.configService.getOrThrow<string>('GITHUB_TOKEN');
  }

  private async githubRequest<T>(path: string, init?: { method?: string; body?: string }): Promise<T> {
    const res = await fetch(`https://api.github.com${path}`, {
      method: init?.method,
      body: init?.body,
      headers: {
        'accept': 'application/vnd.github+json',
        'authorization': `Bearer ${this.githubToken}`,
        'content-type': 'application/json',
      },
    });
    if (!res.ok) throw new Error(`GitHub API ${init?.method ?? 'GET'} ${path} failed with status ${res.status}`);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  private async findOpenRequestIssues(pkgbase: string): Promise<{ number: number; title: string }[]> {
    const data = await this.githubRequest<{ items: { number: number; title: string }[] }>(
      `/search/issues?q=${encodeURIComponent(`repo:${this.githubOwner}/${this.githubRepo} is:issue is:open in:title "${pkgbase}"`)}&per_page=5`,
    );
    return data.items.map((i) => ({ number: i.number, title: i.title }));
  }

  private async createIssue(title: string, body: string, labels: string[]): Promise<void> {
    await this.githubRequest(`/repos/${this.githubOwner}/${this.githubRepo}/issues`, {
      method: 'POST',
      body: JSON.stringify({ title, body, labels }),
    });
  }

  private async createComment(issueNumber: number, body: string): Promise<void> {
    await this.githubRequest(`/repos/${this.githubOwner}/${this.githubRepo}/issues/${issueNumber}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
  }

  private async closeIssue(issueNumber: number): Promise<void> {
    await this.githubRequest(`/repos/${this.githubOwner}/${this.githubRepo}/issues/${issueNumber}`, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'closed' }),
    });
  }

  private async removeLabel(issueNumber: number, label: string): Promise<void> {
    try {
      await this.githubRequest(
        `/repos/${this.githubOwner}/${this.githubRepo}/issues/${issueNumber}/labels/${encodeURIComponent(label)}`,
        {
          method: 'DELETE',
        },
      );
    } catch {
      // ignore
    }
  }

  listenTo() {
    return Build;
  }

  onModuleInit(): void {
    if (!this.dataSource.subscribers.includes(this as never)) {
      this.dataSource.subscribers.push(this as never);
    }
  }

  async afterInsert(event: InsertEvent<Build>): Promise<void> {
    const build = event.entity as Build | undefined;
    if (!build) return;

    const pkgbaseId = build.pkgbaseId;
    if (!pkgbaseId) return;
    const pkg = await this.builds.manager
      .getRepository((await import('./builder.entity')).Package)
      .findOne({ where: { id: pkgbaseId } });
    const pkgbaseName = pkg?.pkgname ?? 'unknown';

    if (build.status === BuildStatus.SUCCESS) {
      const open = await this.findOpenRequestIssues(pkgbaseName);
      const target = open.find((i: { title: string }) => i.title.trim() === `[Issue] ${pkgbaseName}`);
      if (!target) return;

      const recent = await this.builds.find({
        where: { pkgbase: { id: pkgbaseId } } as never,
        order: { id: 'DESC' },
        take: 3,
      });
      const hasPriorDependencyFailure = recent.some(
        (b) => b.failureTags?.includes('dependency') && b.status !== BuildStatus.SUCCESS,
      );
      if (!hasPriorDependencyFailure) return;

      await this.createComment(target.number, `Build ${build.id} succeeded — closing dependency issue.`);
      await this.closeIssue(target.number);
      await this.removeLabel(target.number, 'info:dependency').catch(() => undefined);
      return;
    }

    if (!isFailingStatus(build.status as never) || !build.failureTags?.includes('dependency')) return;

    const recent = await this.builds.find({
      where: { pkgbase: { id: pkgbaseId } } as never,
      order: { id: 'DESC' },
      take: 2,
    });
    const [curr, prior] = recent;
    if (!prior || curr.id === prior.id) return;
    if (prior.status !== BuildStatus.SUCCESS) return;

    const open = await this.findOpenRequestIssues(pkgbaseName);
    if (open.some((i: { title: string }) => i.title.trim() === `[Issue] ${pkgbaseName}`)) return;

    await this.createIssue(
      `[Issue] ${pkgbaseName}`,
      `### Package\n\n${pkgbaseName}\n\n### Issue type\n\nWrong/missing dependency\n\n### Issue description\n\nBuild ${build.id} failed due to dependency (first after success ${prior.id}).\nLog: ${build.logUrl ?? 'n/a'}\n\n### Logs\n\n\`\`\`\n\`\`\``,
      ['request:package-issue', 'info:dependency'],
    );
  }
}
