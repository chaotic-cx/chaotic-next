import { AurScanService } from '@chaotic-next/backend/diff-scan/aur-scan.service';
import { GithubIssuesService } from '@chaotic-next/backend/issue-tracker/github-issues.service';
import { PortableBuilderService } from '@chaotic-next/backend/portable-builder/portable-builder.service';
import { ConflictException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createE2eApp, type E2eApp } from '../test/e2e-app';

const WEBHOOK_SECRET = 'test-github-webhook-secret';
process.env.GITHUB_WEBHOOK_SECRET = WEBHOOK_SECRET;
process.env.GITHUB_TOKEN ??= 'e2e-github-stub-token';

function sign(payload: unknown): string {
  const raw = JSON.stringify(payload);
  return `sha256=${createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex')}`;
}

function validBody(): string {
  return [
    '### Package',
    '',
    'https://aur.archlinux.org/pkgbase/chaotic-mirrorlist',
    '',
    '### Purpose',
    '',
    'test',
    '',
    '### License',
    '',
    'MIT',
    '',
    '### Submission checklist',
    '',
    '- [x] The package is not banned.',
    '- [x] The package is not available in Chaotic AUR or official Arch repos.',
    '- [x] The package has not already been requested.',
  ].join('\n');
}

function validRebuildBody(): string {
  return [
    '### Packages',
    '',
    'https://aur.archlinux.org/pkgbase/chaotic-mirrorlist',
    '',
    '### Description',
    '',
    'test rebuild',
  ].join('\n');
}

describe('Issue tracker webhook (e2e)', () => {
  let e2e: E2eApp;

  beforeAll(async () => {
    e2e = await createE2eApp();
  });

  beforeEach(async () => {
    await e2e.resetTables();
    vi.restoreAllMocks();

    const github = e2e.app.get(GithubIssuesService);
    vi.spyOn(github, 'createComment').mockResolvedValue(undefined);
    vi.spyOn(github, 'addLabels').mockResolvedValue(undefined);
    vi.spyOn(github, 'removeLabel').mockResolvedValue(undefined);
    vi.spyOn(github, 'closeIssue').mockResolvedValue(undefined);
    vi.spyOn(github, 'getIssue').mockResolvedValue(null);
    vi.spyOn(github, 'listComments').mockResolvedValue([]);
    vi.spyOn(github, 'getBotLogin').mockResolvedValue('chaotic-bot');
    vi.spyOn(github, 'findOpenRequestIssues').mockResolvedValue([]);
    vi.spyOn(github, 'findOpenIssuesLabeled').mockResolvedValue([]);
    vi.spyOn(github, 'resolveAurPackageBases').mockImplementation(async (names: string[]) => {
      const m = new Map<string, string | null>();
      for (const n of names) m.set(n.toLowerCase(), n.toLowerCase());
      return m;
    });

    const aurScan = e2e.app.get(AurScanService);
    vi.spyOn(aurScan, 'startScan').mockImplementation(() => Promise.resolve() as never);
    vi.spyOn(aurScan, 'getScan').mockReturnValue({
      packageName: 'chaotic-mirrorlist',
      packageBase: 'chaotic-mirrorlist',
      status: 'done',
      findings: [],
      pkgTypes: ['prebuilt'],
      scannedFiles: ['PKGBUILD'],
      sources: ['PKGBUILD'],
      packageMeta: {
        votes: 0,
        popularity: 0,
        firstSubmitted: new Date().toISOString(),
        orphaned: false,
        outOfDate: false,
      },
      vtReports: [],
      vtPending: 0,
      maintainers: [],
      maintainerChange: null,
    } as unknown as ReturnType<AurScanService['getScan']>);

    const portable = e2e.app.get(PortableBuilderService);
    vi.spyOn(portable, 'enqueue').mockResolvedValue({ id: 1 } as never);
  });

  afterAll(async () => {
    await e2e?.close();
  });

  async function post(payload: unknown, headers: Record<string, string> = {}): Promise<{ statusCode: number }> {
    const rawHeaders = { ...headers };
    if (!rawHeaders['x-hub-signature-256'] && payload !== undefined) {
      rawHeaders['x-hub-signature-256'] = sign(payload);
    }
    if (!rawHeaders['x-github-event']) rawHeaders['x-github-event'] = 'issues';
    return e2e.inject({ method: 'POST', url: '/issue-tracker/webhook', payload, headers: rawHeaders });
  }

  it('rejects missing signature with 401', async () => {
    const payload = { action: 'opened', issue: { number: 1, title: '[Request] foo', body: validBody(), labels: [] } };
    const res = await e2e.inject({
      method: 'POST',
      url: '/issue-tracker/webhook',
      payload,
      headers: { 'x-github-event': 'issues' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects invalid signature with 401', async () => {
    const payload = { action: 'opened', issue: { number: 1, title: '[Request] foo', body: validBody(), labels: [] } };
    const res = await post(payload, {
      'x-hub-signature-256': 'sha256=badbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadab',
    });
    expect(res.statusCode).toBe(401);
  });

  it('ignores unsupported event with 204', async () => {
    const payload = { action: 'opened', issue: { number: 1, title: '[Request] foo', body: validBody(), labels: [] } };
    const res = await post(payload, { 'x-github-event': 'push' });
    expect(res.statusCode).toBe(204);
  });

  it('triages a valid [Request] — scan + needs-triage', async () => {
    const github = e2e.app.get(GithubIssuesService);
    const payload = {
      action: 'opened',
      issue: { number: 10, title: '[Request] chaotic-mirrorlist', body: validBody(), labels: [] },
    };
    const res = await post(payload);
    expect(res.statusCode).toBe(204);
    await vi.waitFor(() => expect(github.addLabels).toHaveBeenCalledWith(10, expect.arrayContaining(['needs-triage'])));
    expect(github.createComment).toHaveBeenCalledWith(10, expect.stringContaining('Automated AUR scan results'));
  });

  it('closes template violation', async () => {
    const github = e2e.app.get(GithubIssuesService);
    const payload = {
      action: 'opened',
      issue: { number: 11, title: '[Request] foo', body: 'no headings here', labels: [] },
    };
    const res = await post(payload);
    expect(res.statusCode).toBe(204);
    await vi.waitFor(() => expect(github.closeIssue).toHaveBeenCalledWith(11));
    expect(github.addLabels).toHaveBeenCalledWith(11, expect.arrayContaining(['invalid:violate-issue-template']));
  });

  it('closes duplicate', async () => {
    const github = e2e.app.get(GithubIssuesService);
    vi.mocked(github.findOpenRequestIssues).mockResolvedValue([{ number: 99, title: '[Request] chaotic-mirrorlist' }]);
    const payload = {
      action: 'opened',
      issue: { number: 12, title: '[Request] chaotic-mirrorlist', body: validBody(), labels: [] },
    };
    const res = await post(payload);
    expect(res.statusCode).toBe(204);
    await vi.waitFor(() => expect(github.closeIssue).toHaveBeenCalledWith(12));
    expect(github.addLabels).toHaveBeenCalledWith(12, expect.arrayContaining(['invalid:duplicate']));
  });

  it('queues build:test on labeled', async () => {
    const portable = e2e.app.get(PortableBuilderService);
    const github = e2e.app.get(GithubIssuesService);
    const payload = {
      action: 'labeled',
      label: { name: 'build:test' },
      issue: {
        number: 13,
        title: '[Rebuild] chaotic-mirrorlist',
        body: validRebuildBody(),
        labels: [{ name: 'build:test' }],
      },
    };
    const res = await post(payload);
    expect(res.statusCode).toBe(204);
    await vi.waitFor(() => expect(portable.enqueue).toHaveBeenCalledWith('chaotic-mirrorlist', 13));
    expect(github.createComment).toHaveBeenCalledWith(13, expect.stringContaining('Queued a test build'));
  });

  it('handles build:test already queued (ConflictException)', async () => {
    const portable = e2e.app.get(PortableBuilderService);
    const github = e2e.app.get(GithubIssuesService);
    vi.mocked(portable.enqueue).mockRejectedValue(new ConflictException('already queued'));
    const payload = {
      action: 'labeled',
      label: { name: 'build:test' },
      issue: {
        number: 14,
        title: '[Rebuild] chaotic-mirrorlist',
        body: validRebuildBody(),
        labels: [{ name: 'build:test' }],
      },
    };
    const res = await post(payload);
    expect(res.statusCode).toBe(204);
    await vi.waitFor(() =>
      expect(github.createComment).toHaveBeenCalledWith(14, expect.stringContaining('already queued')),
    );
  });

  it('retriages when requester comments on waiting:issuer-feedback (issue_comment)', async () => {
    const github = e2e.app.get(GithubIssuesService);
    const payload = {
      action: 'created',
      comment: { user: { login: 'alice' } },
      issue: {
        number: 15,
        title: '[Request] chaotic-mirrorlist',
        body: validBody(),
        labels: [{ name: 'waiting:issuer-feedback' }],
        user: { login: 'alice' },
      },
    };
    const res = await post(payload, { 'x-github-event': 'issue_comment' });
    expect(res.statusCode).toBe(204);
    await vi.waitFor(() => expect(github.createComment).toHaveBeenCalled());
  });

  it('retriages on edited when waiting:issuer-feedback', async () => {
    const github = e2e.app.get(GithubIssuesService);
    const payload = {
      action: 'edited',
      issue: {
        number: 16,
        title: '[Request] chaotic-mirrorlist',
        body: validBody(),
        labels: [{ name: 'waiting:issuer-feedback' }],
        user: { login: 'alice' },
      },
    };
    const res = await post(payload);
    expect(res.statusCode).toBe(204);
    await vi.waitFor(() => expect(github.createComment).toHaveBeenCalled());
  });
});
