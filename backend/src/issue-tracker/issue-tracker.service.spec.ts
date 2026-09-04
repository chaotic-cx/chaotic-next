import { type PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AurScanService } from '../diff-scan/aur-scan.service';
import { DUPLICATE_LABEL, GithubIssuesService, NEEDS_INPUT_LABEL } from './github-issues.service';
import { IssueTrackerService } from './issue-tracker.service';
import type { AurPackageScan } from '@chaotic-next/shared-lib';

const REQUEST_BODY = `### Package

https://aur.archlinux.org/pkgbase/foo-app

### Purpose

A nice application.

### License

GPL-3.0-or-later
`;

const EIGHT_DAYS_MS = 8 * 24 * 60 * 60 * 1000;

function makeGithub(): GithubIssuesService {
  return {
    createComment: vi.fn().mockResolvedValue(undefined),
    addLabels: vi.fn().mockResolvedValue(undefined),
    removeLabel: vi.fn().mockResolvedValue(undefined),
    closeIssue: vi.fn().mockResolvedValue(undefined),
    getIssue: vi.fn().mockResolvedValue({ title: '[Request] foo-app', body: REQUEST_BODY, user: 'someone' }),
    listComments: vi.fn().mockResolvedValue([]),
    findOpenRequestIssues: vi.fn().mockResolvedValue([]),
    findOpenIssuesLabeled: vi.fn().mockResolvedValue([]),
    resolveAurPackageBases: vi.fn().mockImplementation((names: string[]) => {
      const resolution = new Map<string, string | null>();
      for (const name of names) resolution.set(name.toLowerCase(), name.toLowerCase());
      return Promise.resolve(resolution);
    }),
    getBotLogin: vi.fn().mockResolvedValue('request-bot'),
  } as unknown as GithubIssuesService;
}

function makeScan(overrides: Partial<AurPackageScan> = {}): AurPackageScan {
  return {
    packageName: 'foo-app',
    packageBase: 'foo-app',
    status: 'done',
    sources: [],
    scannedFiles: ['PKGBUILD'],
    findings: [],
    vtReports: [],
    vtPending: 0,
    maintainers: [],
    pkgTypes: ['nodejs'],
    packageMeta: { votes: 1, popularity: 0.1, firstSubmitted: '', outOfDate: false, orphaned: false },
    startedAt: new Date().toISOString(),
    ...overrides,
  } as AurPackageScan;
}

function makeAurScan(): AurScanService {
  return {
    startScan: vi.fn().mockImplementation(function (this: unknown, packageName: string) {
      return makeScan({ packageName });
    }),
    getScan: vi.fn().mockImplementation((packageName: string) => makeScan({ packageName })),
  } as unknown as AurScanService;
}

const PINO_STUB = { warn: () => undefined } as unknown as PinoLogger;

function makeChaoticRepo(): { exists: unknown; findOne: unknown } {
  return {
    exists: vi.fn().mockResolvedValue(false),
    findOne: vi.fn().mockResolvedValue(null),
  };
}

function makeArchRepo(): { exists: unknown; findOne: unknown } {
  return {
    exists: vi.fn().mockResolvedValue(false),
    findOne: vi.fn().mockResolvedValue(null),
  };
}

function makePortableBuilder(): object {
  return { jobFinished$: { subscribe: vi.fn() } };
}

function makeService(github: GithubIssuesService, aurScan: AurScanService): IssueTrackerService {
  return new IssueTrackerService(
    github,
    aurScan,
    makePortableBuilder() as never,
    makeChaoticRepo() as never,
    makeArchRepo() as never,
    PINO_STUB,
  );
}

describe('IssueTrackerService.triage', () => {
  let github: GithubIssuesService;
  let aurScan: AurScanService;
  let service: IssueTrackerService;

  beforeEach(() => {
    github = makeGithub();
    aurScan = makeAurScan();
    service = makeService(github, aurScan);
  });

  it('scans a valid request, labels the package kind, and reports a clean result', async () => {
    await service.triage(1, '[Request] foo-app', REQUEST_BODY);
    expect(aurScan.startScan).toHaveBeenCalledWith('foo-app');
    expect(github.createComment).toHaveBeenCalledWith(1, expect.stringContaining(': no critical or warning findings'));
    expect(github.createComment).toHaveBeenCalledWith(
      1,
      expect.stringContaining('[full scan: PKGBUILD and sources](https://aur.chaotic.cx/aur-scan?search=foo-app)'),
    );
    expect(github.addLabels).toHaveBeenCalledWith(1, ['info:node.js']);
    expect(github.removeLabel).toHaveBeenCalledWith(1, NEEDS_INPUT_LABEL);
  });

  it('reports scan findings and VT verdicts on the issue', async () => {
    vi.mocked(aurScan.getScan).mockReturnValue(
      makeScan({
        pkgTypes: ['electron', 'nodejs'],
        findings: [
          {
            ruleId: 'EXFIL-003',
            ruleName: 'Chat webhook exfiltration',
            severity: 'critical',
            description: 'Contains a Telegram webhook URL.',
            file: 'PKGBUILD',
            match: 'api.telegram.org',
          },
        ],
        vtReports: [{ type: 'url', value: 'https://evil.example/x', context: 'source', verdict: 'malicious' }],
      }),
    );
    await service.triage(1, '[Request] foo-app', REQUEST_BODY);
    expect(github.createComment).toHaveBeenCalledWith(1, expect.stringContaining('Chat webhook exfiltration'));
    expect(github.createComment).toHaveBeenCalledWith(1, expect.stringContaining('evil.example'));
    expect(github.addLabels).toHaveBeenCalledWith(1, ['info:electron', 'info:node.js']);
  });

  it('closes plain-text issues without form sections as template violations', async () => {
    await service.triage(1, '[Request] foo-app', 'some free text without sections');
    expect(aurScan.startScan).not.toHaveBeenCalled();
    expect(github.addLabels).toHaveBeenCalledWith(1, ['invalid:violate-issue-template']);
    expect(github.closeIssue).toHaveBeenCalledWith(1);
  });

  it('tags needs-input when form sections are incomplete', async () => {
    const body =
      '### Package\n\nhttps://aur.archlinux.org/pkgbase/foo-app\n\n### Purpose\n\n_No response_\n\n### License\n\nGPL-3.0-or-later\n';
    await service.triage(1, '[Request] foo-app', body);
    expect(aurScan.startScan).not.toHaveBeenCalled();
    expect(github.addLabels).toHaveBeenCalledWith(1, [NEEDS_INPUT_LABEL]);
    expect(github.closeIssue).not.toHaveBeenCalled();
  });

  it('tags needs-input when the pkgbase is missing from the AUR', async () => {
    vi.mocked(github.resolveAurPackageBases).mockImplementation((names: string[]) => {
      const resolution = new Map<string, string | null>();
      for (const name of names) resolution.set(name.toLowerCase(), null);
      return Promise.resolve(resolution);
    });
    await service.triage(1, '[Request] foo-app', REQUEST_BODY);
    expect(github.resolveAurPackageBases).toHaveBeenCalledWith(['foo-app']);
    expect(aurScan.startScan).not.toHaveBeenCalled();
    expect(github.addLabels).toHaveBeenCalledWith(1, [NEEDS_INPUT_LABEL]);
    expect(github.createComment).toHaveBeenCalledWith(1, expect.stringContaining('foo-app'));
  });

  it('collapses split-package member links to one pkgbase', async () => {
    const body = REQUEST_BODY.replace(
      'https://aur.archlinux.org/pkgbase/foo-app',
      'https://aur.archlinux.org/packages/foo-app\nhttps://aur.archlinux.org/packages/foo-portal',
    );
    vi.mocked(github.resolveAurPackageBases).mockImplementation((names: string[]) => {
      const resolution = new Map<string, string | null>([
        ['foo-app', 'foo-app'],
        ['foo-portal', 'foo-app'],
      ]);
      for (const name of names) if (!resolution.has(name)) resolution.set(name, null);
      return Promise.resolve(resolution);
    });
    await service.triage(1, '[Request] foo-app', body);
    expect(github.createComment).not.toHaveBeenCalledWith(1, expect.stringContaining('several package bases'));
    expect(aurScan.startScan).toHaveBeenCalledWith('foo-app');
  });

  it('tags needs-input when a request covers several package bases', async () => {
    const body = REQUEST_BODY.replace(
      'https://aur.archlinux.org/pkgbase/foo-app',
      'https://aur.archlinux.org/pkgbase/foo-app\nhttps://aur.archlinux.org/pkgbase/bar-lib',
    );
    vi.mocked(github.resolveAurPackageBases).mockImplementation((names: string[]) => {
      const resolution = new Map<string, string | null>();
      for (const name of names) resolution.set(name, name);
      return Promise.resolve(resolution);
    });
    await service.triage(1, '[Request] foo-app', body);
    expect(github.createComment).toHaveBeenCalledWith(1, expect.stringContaining('several package bases'));
    expect(aurScan.startScan).not.toHaveBeenCalled();
  });

  it('skips AUR check and scan for custom rebuilds', async () => {
    const body =
      '### Packages\n\nhttps://github.com/example/my-custom-pkg\n\n### Description\n\nBroken on new kernel.\n\n- [x] This is a custom package that is not available on the AUR.\n';
    await service.triage(1, '[Rebuild] my-custom-pkg', body);
    expect(github.resolveAurPackageBases).not.toHaveBeenCalled();
    expect(aurScan.startScan).not.toHaveBeenCalled();
    expect(github.createComment).not.toHaveBeenCalled();
    expect(github.addLabels).not.toHaveBeenCalledWith(1, [NEEDS_INPUT_LABEL]);
  });

  it('closes a request for a package that chaotic-aur already builds, with a search link', async () => {
    vi.mocked(service['chaoticPackages'].findOne as ReturnType<typeof vi.fn>).mockResolvedValue({
      pkgname: 'foo-app',
      pkgbaseName: 'foo-app',
    });
    await service.triage(1, '[Request] foo-app', REQUEST_BODY);
    expect(aurScan.startScan).not.toHaveBeenCalled();
    expect(github.createComment).toHaveBeenCalledWith(1, expect.stringContaining('chaotic-aur repository'));
    expect(github.createComment).toHaveBeenCalledWith(
      1,
      expect.stringContaining('aur.chaotic.cx/stats/search?search=foo-app'),
    );
    expect(github.closeIssue).toHaveBeenCalledWith(1);
  });

  it('closes a request for a package that ships in the official repositories', async () => {
    vi.mocked(service['archPackages'].findOne as ReturnType<typeof vi.fn>).mockResolvedValue({
      pkgname: 'foo-app',
      repo: 'extra',
      arch: 'x86_64',
    });
    await service.triage(1, '[Request] foo-app', REQUEST_BODY);
    expect(aurScan.startScan).not.toHaveBeenCalled();
    expect(github.addLabels).toHaveBeenCalledWith(1, ['info:official-repo']);
    expect(github.closeIssue).toHaveBeenCalledWith(1);
  });

  it('reports orphaned packages in the scan summary', async () => {
    vi.mocked(aurScan.getScan).mockReturnValue(
      makeScan({ packageMeta: { votes: 7, popularity: 0.03, firstSubmitted: '', outOfDate: false, orphaned: true } }),
    );
    await service.triage(1, '[Request] foo-app', REQUEST_BODY);
    expect(github.createComment).toHaveBeenCalledWith(1, expect.stringContaining('has no maintainer'));
  });

  it('lists every finding as its own alert bullet, criticals first', async () => {
    vi.mocked(aurScan.getScan).mockReturnValue(
      makeScan({
        pkgTypes: ['compiled'],
        findings: [
          {
            ruleId: 'A',
            ruleName: 'First rule',
            severity: 'critical',
            description: 'd',
            file: 'PKGBUILD',
            line: 7,
            match: 'x',
          },
          { ruleId: 'B', ruleName: 'Second rule', severity: 'warning', description: 'd', file: 'PKGBUILD', match: 'x' },
          {
            ruleId: 'C',
            ruleName: 'Third rule',
            severity: 'warning',
            description: 'd',
            file: 'other.patch',
            match: 'x',
          },
        ],
      }),
    );
    await service.triage(1, '[Request] foo-app', REQUEST_BODY);
    expect(github.createComment).toHaveBeenCalledWith(1, expect.stringContaining('> [!CAUTION]'));
    expect(github.createComment).toHaveBeenCalledWith(1, expect.stringContaining('> - `PKGBUILD:7` — **First rule**'));
    expect(github.createComment).toHaveBeenCalledWith(1, expect.stringContaining('> - `other.patch` — **Third rule**'));
  });

  it('closes a duplicate of the same kind without scanning', async () => {
    vi.mocked(github.findOpenRequestIssues).mockResolvedValue([{ number: 42, title: '[Request] foo-app' }]);
    await service.triage(7, '[Request] foo-app', REQUEST_BODY);
    expect(aurScan.startScan).not.toHaveBeenCalled();
    expect(github.createComment).toHaveBeenCalledWith(7, expect.stringContaining('#42'));
    expect(github.addLabels).toHaveBeenCalledWith(7, [DUPLICATE_LABEL]);
    expect(github.closeIssue).toHaveBeenCalledWith(7);
  });

  it('never treats a rebuild issue as a duplicate of a package request', async () => {
    vi.mocked(github.findOpenRequestIssues).mockResolvedValue([{ number: 3, title: '[Rebuild] firedragon' }]);
    await service.triage(1, '[Request] firedragon', REQUEST_BODY.replace(/foo-app/g, 'firedragon'));
    expect(github.closeIssue).not.toHaveBeenCalled();
    expect(github.addLabels).not.toHaveBeenCalledWith(1, [DUPLICATE_LABEL]);
    expect(aurScan.startScan).toHaveBeenCalledWith('firedragon');
  });

  it('does not scan rebuild requests — only package requests are scanned', async () => {
    const rebuildBody = [
      '### Packages',
      '',
      'https://aur.archlinux.org/pkgbase/foo-app',
      '',
      '### Description',
      '',
      'Outdated: 1.0 vs 2.0.',
    ].join('\n');
    await service.triage(1, '[Rebuild] foo-app', rebuildBody);
    expect(aurScan.startScan).not.toHaveBeenCalled();
    expect(github.createComment).not.toHaveBeenCalledWith(1, expect.stringContaining('Automated AUR scan results'));
    await service.triage(
      2,
      '[Issue] foo-app',
      [
        '### Package',
        '',
        'foo-app',
        '',
        '### Issue type',
        '',
        'Build failure',
        '',
        '### Issue description',
        '',
        'Fails',
        '',
        '### Logs',
        '',
        'error',
      ].join('\n'),
    );
    expect(aurScan.startScan).not.toHaveBeenCalled();
  });
});

describe('IssueTrackerService.handleIssueEvent', () => {
  let github: GithubIssuesService;
  let aurScan: AurScanService;
  let service: IssueTrackerService;

  beforeEach(() => {
    github = makeGithub();
    aurScan = makeAurScan();
    service = makeService(github, aurScan);
  });

  function payload(
    action: string,
    labels: { name: string }[] = [],
  ): Parameters<IssueTrackerService['handleIssueEvent']>[0] {
    return { action, issue: { number: 1, title: '[Request] foo-app', body: REQUEST_BODY, labels } };
  }

  it('triages on opened', async () => {
    await service.handleIssueEvent(payload('opened'));
    expect(aurScan.startScan).toHaveBeenCalledWith('foo-app');
  });

  it('retriages on edited only when the issue carries needs-input', async () => {
    await service.handleIssueEvent(payload('edited', [{ name: NEEDS_INPUT_LABEL }]));
    expect(github.removeLabel).toHaveBeenCalledWith(1, NEEDS_INPUT_LABEL);

    vi.mocked(github.removeLabel).mockClear();
    vi.mocked(aurScan.startScan).mockClear();
    await service.handleIssueEvent(payload('edited', [{ name: 'duplicate' }]));
    expect(github.removeLabel).not.toHaveBeenCalled();
    expect(aurScan.startScan).not.toHaveBeenCalled();
  });

  it('retriages when the requester comments on an issuer-feedback issue', async () => {
    vi.mocked(github.getIssue).mockResolvedValue({ title: '[Request] foo-app', body: REQUEST_BODY, user: 'someone' });
    await service.handleIssueEvent({
      action: 'created',
      issue: {
        number: 1,
        title: '[Request] foo-app',
        body: REQUEST_BODY,
        labels: [{ name: 'waiting:issuer-feedback' }],
        user: { login: 'someone' },
      },
      comment: { user: { login: 'someone' } },
    });
    expect(github.removeLabel).toHaveBeenCalledWith(1, NEEDS_INPUT_LABEL);
  });

  it('ignores comments from other users on an issuer-feedback issue', async () => {
    vi.mocked(github.getIssue).mockResolvedValue({ title: '[Request] foo-app', body: REQUEST_BODY, user: 'someone' });
    await service.handleIssueEvent({
      action: 'created',
      issue: {
        number: 1,
        title: '[Request] foo-app',
        body: REQUEST_BODY,
        labels: [{ name: 'waiting:issuer-feedback' }],
        user: { login: 'someone' },
      },
      comment: { user: { login: 'someone-else' } },
    });
    expect(github.removeLabel).not.toHaveBeenCalled();
    expect(aurScan.startScan).not.toHaveBeenCalled();
  });

  it('ignores unrelated actions', async () => {
    await service.handleIssueEvent(payload('closed'));
    expect(aurScan.startScan).not.toHaveBeenCalled();
    expect(github.addLabels).not.toHaveBeenCalled();
  });
});

describe('IssueTrackerService.sweepStale', () => {
  let github: GithubIssuesService;
  let service: IssueTrackerService;

  beforeEach(() => {
    github = makeGithub();
    service = makeService(github, makeAurScan());
  });

  function comment(login: string, ageMs: number) {
    return { user: { login }, created_at: new Date(Date.now() - ageMs).toISOString() };
  }

  it('retriages instead of closing when the requester answered after the bot', async () => {
    vi.mocked(github.findOpenIssuesLabeled).mockResolvedValue([{ number: 9, title: 'x' }]);
    vi.mocked(github.listComments).mockResolvedValue([
      comment('request-bot', EIGHT_DAYS_MS),
      comment('someone', 24 * 60 * 60 * 1000),
    ]);

    await service.sweepStale();

    expect(github.closeIssue).not.toHaveBeenCalled();
    expect(github.removeLabel).toHaveBeenCalledWith(9, NEEDS_INPUT_LABEL);
  });

  it('closes an unanswered stale issue', async () => {
    vi.mocked(github.findOpenIssuesLabeled).mockResolvedValue([{ number: 10, title: 'x' }]);
    vi.mocked(github.listComments).mockResolvedValue([comment('request-bot', EIGHT_DAYS_MS)]);

    await service.sweepStale();

    expect(github.createComment).toHaveBeenCalledWith(10, expect.stringContaining('Closing for now'));
    expect(github.removeLabel).toHaveBeenCalledWith(10, NEEDS_INPUT_LABEL);
    expect(github.closeIssue).toHaveBeenCalledWith(10);
  });

  it('skips issues whose needs-input tag is younger than the grace period', async () => {
    vi.mocked(github.findOpenIssuesLabeled).mockResolvedValue([{ number: 11, title: 'x' }]);
    vi.mocked(github.listComments).mockResolvedValue([comment('request-bot', 24 * 60 * 60 * 1000)]);

    await service.sweepStale();

    expect(github.closeIssue).not.toHaveBeenCalled();
  });

  it('skips issues without a bot comment', async () => {
    vi.mocked(github.findOpenIssuesLabeled).mockResolvedValue([{ number: 12, title: 'x' }]);
    vi.mocked(github.listComments).mockResolvedValue([comment('someone', EIGHT_DAYS_MS)]);

    await service.sweepStale();

    expect(github.closeIssue).not.toHaveBeenCalled();
  });
});

describe('IssueTrackerService cutoff and 2-pkgbase handling', () => {
  let github: GithubIssuesService;
  let aurScan: AurScanService;
  let service: IssueTrackerService;

  beforeEach(() => {
    github = makeGithub();
    aurScan = makeAurScan();
    service = makeService(github, aurScan);
  });

  it('suppresses needs-input for requests before CUTOFF', async () => {
    const beforeCutoff = '2026-01-01T00:00:00.000Z';
    await service.triage(
      1,
      'bad title',
      '### Package\n\nfoo\n\n### Purpose\n\nx\n\n### License\n\nMIT\n',
      beforeCutoff,
    );
    expect(github.addLabels).not.toHaveBeenCalledWith(1, expect.arrayContaining([NEEDS_INPUT_LABEL]));
    expect(github.createComment).not.toHaveBeenCalledWith(1, expect.stringContaining('needs attention'));
  });

  it('still prompts for requests after CUTOFF', async () => {
    const afterCutoff = '2026-07-01T00:00:00.000Z';
    await service.triage(1, 'bad title', '### Package\n\nfoo\n\n### Purpose\n\nx\n\n### License\n\nMIT\n', afterCutoff);
    expect(github.addLabels).toHaveBeenCalledWith(1, expect.arrayContaining([NEEDS_INPUT_LABEL]));
  });

  it('skips closing fulfilled request when title has 2 pkgbases', async () => {
    vi.mocked(service['chaoticPackages'].findOne as ReturnType<typeof vi.fn>).mockResolvedValue({
      pkgname: 'foo-app',
      pkgbaseName: 'foo-app',
      isActive: true,
      version: '1.0-1',
    });
    vi.mocked(github.findOpenRequestIssues).mockResolvedValue([{ number: 99, title: '[Request] foo-app, bar-lib' }]);
    await service.closeFulfilledNewRequest('foo-app');
    expect(github.closeIssue).not.toHaveBeenCalled();
    expect(github.createComment).not.toHaveBeenCalled();
  });

  it('closes fulfilled request with single pkgbase', async () => {
    vi.mocked(service['chaoticPackages'].findOne as ReturnType<typeof vi.fn>).mockResolvedValue({
      pkgname: 'foo-app',
      pkgbaseName: 'foo-app',
      isActive: true,
      version: '1.0-1',
    });
    vi.mocked(github.findOpenRequestIssues).mockResolvedValue([{ number: 99, title: '[Request] foo-app' }]);
    await service.closeFulfilledNewRequest('foo-app');
    expect(github.closeIssue).toHaveBeenCalledWith(99);
  });

  it('skips closing fulfilled rebuild when title has 2 pkgbases', async () => {
    vi.mocked(github.findOpenRequestIssues).mockResolvedValue([{ number: 100, title: '[Rebuild] foo-app, bar-lib' }]);
    await service.closeFulfilledRebuild('foo-app');
    expect(github.closeIssue).not.toHaveBeenCalled();
  });

  // regression: exact pkgbase match — substring search must not close sibling package
  it('does not close alacritty-sixel-git when alacritty-git is deployed (substring trap)', async () => {
    vi.mocked(service['chaoticPackages'].findOne as ReturnType<typeof vi.fn>).mockResolvedValue({
      pkgname: 'alacritty-git',
      pkgbaseName: 'alacritty-git',
      isActive: true,
      version: '1.0-1',
    });
    // GitHub search `in:title "alacritty-git"` can return sibling with shared prefix
    vi.mocked(github.findOpenRequestIssues).mockResolvedValue([
      { number: 4152, title: '[Request] alacritty-sixel-git' },
    ]);
    await service.closeFulfilledNewRequest('alacritty-git');
    expect(github.closeIssue).not.toHaveBeenCalled();
    expect(github.createComment).not.toHaveBeenCalled();
  });

  it('does not close alacritty-sixel-git rebuild when alacritty-git is built', async () => {
    vi.mocked(github.findOpenRequestIssues).mockResolvedValue([
      { number: 4153, title: '[Rebuild] alacritty-sixel-git' },
    ]);
    await service.closeFulfilledRebuild('alacritty-git');
    expect(github.closeIssue).not.toHaveBeenCalled();
  });

  it('closes only the exact matching issue among multiple search hits', async () => {
    vi.mocked(service['chaoticPackages'].findOne as ReturnType<typeof vi.fn>).mockResolvedValue({
      pkgname: 'alacritty-git',
      pkgbaseName: 'alacritty-git',
      isActive: true,
      version: '1.0-1',
    });
    vi.mocked(github.findOpenRequestIssues).mockResolvedValue([
      { number: 10, title: '[Request] alacritty-git' },
      { number: 11, title: '[Request] alacritty-sixel-git' },
    ]);
    await service.closeFulfilledNewRequest('alacritty-git');
    expect(github.closeIssue).toHaveBeenCalledWith(10);
    expect(github.closeIssue).not.toHaveBeenCalledWith(11);
  });

  // regression: failed/intermediate Package stubs must not close requests
  it('does not close request when package has no version (failed-build stub)', async () => {
    vi.mocked(service['chaoticPackages'].findOne as ReturnType<typeof vi.fn>).mockResolvedValue({
      pkgname: 'proton-pass',
      pkgbaseName: 'proton-pass',
      isActive: true,
      version: null,
    });
    vi.mocked(github.findOpenRequestIssues).mockResolvedValue([{ number: 4284, title: '[Request] proton-pass' }]);
    await service.closeFulfilledNewRequest('proton-pass');
    expect(github.closeIssue).not.toHaveBeenCalled();
  });

  it('does not close request when package is inactive', async () => {
    vi.mocked(service['chaoticPackages'].findOne as ReturnType<typeof vi.fn>).mockResolvedValue({
      pkgname: 'proton-pass',
      pkgbaseName: 'proton-pass',
      isActive: false,
      version: '1.0-1',
    });
    vi.mocked(github.findOpenRequestIssues).mockResolvedValue([{ number: 4284, title: '[Request] proton-pass' }]);
    await service.closeFulfilledNewRequest('proton-pass');
    expect(github.closeIssue).not.toHaveBeenCalled();
  });

  it('does not close request when package not yet in DB', async () => {
    vi.mocked(service['chaoticPackages'].findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    vi.mocked(github.findOpenRequestIssues).mockResolvedValue([{ number: 4284, title: '[Request] proton-pass' }]);
    await service.closeFulfilledNewRequest('proton-pass');
    expect(github.closeIssue).not.toHaveBeenCalled();
  });

  it('filters EOL and orphaned for requests before CUTOFF', async () => {
    const beforeCutoff = '2026-01-01T00:00:00.000Z';
    vi.mocked(aurScan.getScan).mockReturnValue(
      makeScan({
        findings: [
          {
            ruleId: 'CAUR-EOL-DEP',
            ruleName: 'EOL',
            severity: 'warning',
            description: 'd',
            file: 'PKGBUILD',
            match: 'x',
          },
        ],
        packageMeta: {
          votes: 1,
          popularity: 0.1,
          firstSubmitted: '2020-01-01T00:00:00.000Z',
          outOfDate: false,
          orphaned: true,
        },
      }),
    );
    await service.triage(1, '[Request] foo-app', REQUEST_BODY, beforeCutoff);
    expect(github.addLabels).not.toHaveBeenCalledWith(1, expect.arrayContaining(['info:library-eol']));
    expect(github.addLabels).not.toHaveBeenCalledWith(1, expect.arrayContaining(['info:orphaned']));
  });
});
