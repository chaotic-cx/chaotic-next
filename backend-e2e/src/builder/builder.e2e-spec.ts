import { BuildStatus } from '@chaotic-next/backend/types/types';
import type { Paginated } from '@chaotic-next/shared-lib';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createE2eApp, type E2eApp } from '../test/e2e-app';
import { CHAOTIC_AUR_REPO, GARUDA_REPO } from '../test/fixtures';

describe('Builder endpoints (e2e, real PostgreSQL)', () => {
  let e2e: E2eApp;

  beforeAll(async () => {
    e2e = await createE2eApp();
  });

  afterAll(async () => {
    await e2e?.close();
  });

  beforeEach(async () => {
    await e2e.resetTables();
  });

  describe('GET /builder/builders', () => {
    it('returns all seeded builders', async () => {
      await e2e.seedBuilder({ name: 'immortalis-1', isActive: true });
      await e2e.seedBuilder({ name: 'stormwing-2', isActive: false });

      const res = await e2e.inject<{ name: string }[]>({ method: 'GET', url: '/builder/builders' });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      expect(body.map((b) => b.name).sort()).toEqual(['immortalis-1', 'stormwing-2']);
    });

    it('returns an empty array when no builders exist', async () => {
      const res = await e2e.inject<unknown[]>({ method: 'GET', url: '/builder/builders' });
      expect(res.statusCode).toBe(200);
      expect(await res.json()).toEqual([]);
    });
  });

  describe('GET /builder/repos', () => {
    it('returns only active repos', async () => {
      await e2e.seedRepo({ name: GARUDA_REPO.name, isActive: true });
      await e2e.seedRepo({ name: 'no-failover', isActive: false });

      const res = await e2e.inject<{ name: string }[]>({ method: 'GET', url: '/builder/repos' });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      expect(body.map((r) => r.name)).toEqual([GARUDA_REPO.name]);
    });
  });

  describe('GET /builder/package/:name', () => {
    it('returns the package with its repo name', async () => {
      const repo = await e2e.seedRepo({ name: CHAOTIC_AUR_REPO.name });
      await e2e.seedPackage({ pkgname: 'firedragon', version: '2:13.1.1', repo });

      const res = await e2e.inject<{ pkgname: string; version: string }>({
        method: 'GET',
        url: '/builder/package/firedragon',
      });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      expect(body.pkgname).toBe('firedragon');
      expect(body.version).toBe('2:13.1.1');
    });

    it('answers 404 for an unknown package', async () => {
      const res = await e2e.inject({ method: 'GET', url: '/builder/package/nope' });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /builder/packages', () => {
    it('returns a paginated list with total count', async () => {
      const repo = await e2e.seedRepo({ name: CHAOTIC_AUR_REPO.name });
      await e2e.seedPackage({ pkgname: 'firedragon', version: '2:13.1.1', repo });
      await e2e.seedPackage({ pkgname: 'google-chrome', version: '151.0.7922.71', repo });

      const res = await e2e.inject<Paginated<unknown>>({ method: 'GET', url: '/builder/packages' });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      expect(body.total).toBe(2);
    });

    it('filters by search query q', async () => {
      const repo = await e2e.seedRepo({ name: CHAOTIC_AUR_REPO.name });
      await e2e.seedPackage({ pkgname: 'firedragon', version: '2:13.1.1', repo });
      await e2e.seedPackage({ pkgname: 'firedragon-settings', version: '1.0-1', repo });
      await e2e.seedPackage({ pkgname: 'google-chrome', version: '151.0.7922.71', repo });

      const res = await e2e.inject<Paginated<{ pkgname: string }>>({
        method: 'GET',
        url: '/builder/packages?q=firedragon',
      });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      expect(body.total).toBe(2);
      expect(body.items.every((p) => p.pkgname.includes('firedragon'))).toBe(true);
    });

    it('supports pagination via page and perPage', async () => {
      const repo = await e2e.seedRepo({ name: CHAOTIC_AUR_REPO.name });
      for (const pkgname of ['firedragon', 'google-chrome', 'spotify', 'paru', 'yay']) {
        await e2e.seedPackage({ pkgname, version: '1.0-1', repo });
      }

      const res = await e2e.inject<Paginated<unknown>>({ method: 'GET', url: '/builder/packages?page=1&perPage=2' });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      expect(body.total).toBe(5);
      expect(body.items).toHaveLength(2);
    });

    it('sorts ascending by pkgname when order=ASC', async () => {
      const repo = await e2e.seedRepo({ name: CHAOTIC_AUR_REPO.name });
      await e2e.seedPackage({ pkgname: 'zzz-last', version: '1.0-1', repo });
      await e2e.seedPackage({ pkgname: 'aaa-first', version: '1.0-1', repo });

      const res = await e2e.inject<Paginated<{ pkgname: string }>>({
        method: 'GET',
        url: '/builder/packages?sort=pkgname&order=ASC',
      });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      expect(body.items[0].pkgname).toBe('aaa-first');
    });

    it('falls back to pkgname sort on an invalid sort field', async () => {
      const repo = await e2e.seedRepo({ name: CHAOTIC_AUR_REPO.name });
      await e2e.seedPackage({ pkgname: 'firedragon', version: '1.0-1', repo });

      const res = await e2e.inject<Paginated<{ pkgname: string }>>({
        method: 'GET',
        url: '/builder/packages?sort=DROP_TABLE',
      });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      expect(body.items).toHaveLength(1);
      expect(body.items[0].pkgname).toBe('firedragon');
    });

    it('includes repo info when repo=true', async () => {
      const repo = await e2e.seedRepo({ name: GARUDA_REPO.name });
      await e2e.seedPackage({ pkgname: 'firedragon', version: '2:13.1.1', repo });

      const res = await e2e.inject<Paginated<{ pkgname: string; reponame?: string }>>({
        method: 'GET',
        url: '/builder/packages?repo=true',
      });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      expect(body.items[0].reponame).toBe(GARUDA_REPO.name);
    });

    it('searches by description via metadata desc field', async () => {
      const repo = await e2e.seedRepo({ name: CHAOTIC_AUR_REPO.name });
      await e2e.seedPackage({
        pkgname: 'google-chrome',
        version: '1.0-1',
        repo,
        metadata: {
          filename: 'google-chrome-1.0-1-x86_64.pkg.tar.zst',
          desc: 'The popular web browser by Google',
          buildDate: '2025-01-01T00:00:00Z',
        },
      });
      await e2e.seedPackage({
        pkgname: 'paru',
        version: '1.0-1',
        repo,
        metadata: { filename: 'paru-1.0-1-x86_64.pkg.tar.zst', desc: 'AUR helper', buildDate: '2025-01-01T00:00:00Z' },
      });

      const res = await e2e.inject<Paginated<{ pkgname: string }>>({
        method: 'GET',
        url: '/builder/packages?q=browser',
      });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      expect(body.total).toBe(1);
      expect(body.items[0].pkgname).toBe('google-chrome');
    });
  });

  describe('GET /builder/package/:name', () => {
    it('returns the package with the given name', async () => {
      const repo = await e2e.seedRepo({ name: GARUDA_REPO.name });
      await e2e.seedPackage({ pkgname: 'firedragon', version: '2:13.1.1', repo });

      const res = await e2e.inject<{ pkgname: string; version: string }>({
        method: 'GET',
        url: `/builder/package/firedragon?repo=${GARUDA_REPO.name}`,
      });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      expect(body.pkgname).toBe('firedragon');
      expect(body.version).toBe('2:13.1.1');
    });
  });

  describe('GET /builder/builds', () => {
    it('returns a paginated list of builds', async () => {
      await e2e.seedBuild({});
      await e2e.seedBuild({});

      const res = await e2e.inject<Paginated<unknown>>({ method: 'GET', url: '/builder/builds' });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      expect(body.total).toBe(2);
    });

    it('filters by build status', async () => {
      await e2e.seedBuild({ status: BuildStatus.SUCCESS });
      await e2e.seedBuild({ status: BuildStatus.FAILED });

      const res = await e2e.inject<Paginated<{ status: number }>>({ method: 'GET', url: '/builder/builds?status=3' });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      expect(body.total).toBe(1);
      expect(body.items[0].status).toBe(3);
    });

    it('filters by builder name', async () => {
      const builder = await e2e.seedBuilder({ name: 'immortalis-1' });
      const otherBuilder = await e2e.seedBuilder({ name: 'stormwing-2' });
      await e2e.seedBuild({ builder });
      await e2e.seedBuild({ builder: otherBuilder });

      const res = await e2e.inject<Paginated<unknown>>({ method: 'GET', url: '/builder/builds?builder=immortalis-1' });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      expect(body.total).toBe(1);
    });

    it('filters by repo name', async () => {
      const repo = await e2e.seedRepo({ name: 'chaotic-aur' });
      const otherRepo = await e2e.seedRepo({ name: 'garuda' });
      await e2e.seedBuild({ repo });
      await e2e.seedBuild({ repo: otherRepo });

      const res = await e2e.inject<Paginated<unknown>>({ method: 'GET', url: '/builder/builds?repo=chaotic-aur' });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      expect(body.total).toBe(1);
    });

    it('filters by search query q across pkgname', async () => {
      const repo = await e2e.seedRepo({ name: 'chaotic-aur' });
      const pkg = await e2e.seedPackage({ pkgname: 'firedragon', version: '1.0-1', repo });
      const otherPkg = await e2e.seedPackage({ pkgname: 'google-chrome', version: '1.0-1', repo });
      await e2e.seedBuild({ pkgbase: pkg });
      await e2e.seedBuild({ pkgbase: otherPkg });

      const res = await e2e.inject<Paginated<unknown>>({ method: 'GET', url: '/builder/builds?q=firedragon' });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      expect(body.total).toBe(1);
    });

    it('falls back to id sort on an invalid sort field', async () => {
      await e2e.seedBuild({});

      const res = await e2e.inject<Paginated<unknown>>({ method: 'GET', url: '/builder/builds?sort=DROP_TABLE' });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      expect(body.total).toBe(1);
    });

    it('sorts by resource metric with unsampled builds last', async () => {
      const light = await e2e.seedPackage({ pkgname: 'nano' });
      const hungry = await e2e.seedPackage({ pkgname: 'linux-tkg' });
      const unsampled = await e2e.seedPackage({ pkgname: 'bash' });
      await e2e.seedBuild({ pkgbase: light, resourceStats: { peakMemoryBytes: 50_000_000, sampleCount: 5 } });

      // Inserted last on purpose: id order would put it first, so the sort must win.
      await e2e.seedBuild({ pkgbase: hungry, resourceStats: { peakMemoryBytes: 8_000_000_000, sampleCount: 10 } });
      await e2e.seedBuild({ pkgbase: unsampled });

      const res = await e2e.inject<Paginated<{ resourceStats: { peakMemoryBytes: string | null } | null }>>({
        method: 'GET',
        url: '/builder/builds?sort=peakMemory&order=DESC',
      });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      expect(body.items.map((b) => b.resourceStats?.peakMemoryBytes ?? null)).toEqual(['8000000000', '50000000', null]);
    });
  });

  describe('GET /builder/latest', () => {
    it('returns the latest builds limited by amount', async () => {
      for (let i = 0; i < 3; i++) {
        await e2e.seedBuild({});
      }

      const res = await e2e.inject<unknown[]>({ method: 'GET', url: '/builder/latest?amount=2' });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(2);
    });

    it('filters by status', async () => {
      await e2e.seedBuild({ status: BuildStatus.SUCCESS });
      await e2e.seedBuild({ status: BuildStatus.FAILED });

      const res = await e2e.inject<{ status: number }[]>({ method: 'GET', url: '/builder/latest?status=0' });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(1);
      expect(body[0].status).toBe(0);
    });

    it('applies offset to skip builds', async () => {
      for (let i = 0; i < 3; i++) {
        await e2e.seedBuild({});
      }

      const res = await e2e.inject<unknown[]>({ method: 'GET', url: '/builder/latest?amount=2&offset=1' });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(2);
    });
  });

  describe('GET /builder/latest/url/:amount', () => {
    it('returns latest builds with log URLs and commit hashes', async () => {
      const repo = await e2e.seedRepo({ name: 'chaotic-aur' });
      const pkg = await e2e.seedPackage({ pkgname: 'firedragon', version: '2:13.1.1', repo });
      await e2e.seedBuild({
        pkgbase: pkg,
        logUrl: 'https://builds.garudalinux.org/logs/firedragon.html',
        commit: 'abc123',
      });

      const res = await e2e.inject<{ pkgname: string; logUrl: string; commit: string; version: string }[]>({
        method: 'GET',
        url: '/builder/latest/url/10',
      });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      expect(body.length).toBeGreaterThanOrEqual(1);
      const row = body.find((b) => b.pkgname === 'firedragon');
      expect(row).toBeDefined();
      expect(row?.logUrl).toBe('https://builds.garudalinux.org/logs/firedragon.html');
      expect(row?.commit).toBe('abc123');
    });
  });

  describe('GET /builder/latest/:pkgname', () => {
    it('returns builds filtered by package name', async () => {
      const repo = await e2e.seedRepo({ name: 'garuda' });
      const firedragon = await e2e.seedPackage({ pkgname: 'firedragon', version: '2:13.1.1', repo });
      const chrome = await e2e.seedPackage({ pkgname: 'google-chrome', version: '151.0.7922.71', repo });
      await e2e.seedBuild({ pkgbase: firedragon });
      await e2e.seedBuild({ pkgbase: chrome });
      await e2e.seedBuild({ pkgbase: firedragon });

      const res = await e2e.inject<unknown[]>({ method: 'GET', url: '/builder/latest/firedragon?amount=10' });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(2);
    });
  });

  describe('GET /builder/latest/:pkgname/:amount', () => {
    it('limits results to the requested amount for a package', async () => {
      const repo = await e2e.seedRepo({ name: 'chaotic-aur' });
      const pkg = await e2e.seedPackage({ pkgname: 'paru', version: '2.1.0-2', repo });
      await e2e.seedBuild({ pkgbase: pkg });
      await e2e.seedBuild({ pkgbase: pkg });
      await e2e.seedBuild({ pkgbase: pkg });

      const res = await e2e.inject<unknown[]>({ method: 'GET', url: '/builder/latest/paru/2?offset=0' });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(2);
    });
  });

  describe('GET /builder/count/days', () => {
    it('returns build counts per package across all time', async () => {
      await e2e.seedBuild({});

      const res = await e2e.inject<{ pkgbase: string; count: string }[]>({
        method: 'GET',
        url: '/builder/count/days',
      });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      expect(body.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /builder/count/days/:days', () => {
    it('returns build counts per package', async () => {
      await e2e.seedBuild({});

      const res = await e2e.inject<{ pkgbase: string; count: string }[]>({
        method: 'GET',
        url: '/builder/count/days/30',
      });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      expect(body.length).toBeGreaterThanOrEqual(1);
      expect(body[0].count).toBe('1');
    });
  });

  describe('GET /builder/count/package/:pkgname', () => {
    it('returns the total build count for a specific package', async () => {
      const repo = await e2e.seedRepo({ name: 'chaotic-aur' });
      const pkg = await e2e.seedPackage({ pkgname: 'firedragon', version: '2:13.1.1', repo });
      await e2e.seedBuild({ pkgbase: pkg });
      await e2e.seedBuild({ pkgbase: pkg });
      await e2e.seedBuild({});

      const res = await e2e.inject<number | string>({ method: 'GET', url: '/builder/count/package/firedragon' });

      expect(res.statusCode).toBe(200);
      const count = await res.json();
      expect(Number(count)).toBe(2);
    });
  });

  describe('GET /builder/count/:pkgname/:amount', () => {
    it('returns build counts per day for a specific package', async () => {
      const repo = await e2e.seedRepo({ name: 'garuda' });
      const pkg = await e2e.seedPackage({ pkgname: 'firedragon', version: '2:13.1.1', repo });
      await e2e.seedBuild({ pkgbase: pkg });

      const res = await e2e.inject<{ day: string; repo: string; count: string }[]>({
        method: 'GET',
        url: '/builder/count/firedragon/30',
      });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      expect(body.length).toBeGreaterThanOrEqual(1);
    });

    it('returns 404 for an unknown package', async () => {
      const res = await e2e.inject({ method: 'GET', url: '/builder/count/nonexistent-pkg/30' });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /builder/popular/:amount', () => {
    it('returns popular packages ranked by build count', async () => {
      const repo = await e2e.seedRepo({ name: 'chaotic-aur' });
      const pkg = await e2e.seedPackage({ pkgname: 'firedragon', version: '2:13.1.1', repo });
      await e2e.seedBuild({ pkgbase: pkg });
      await e2e.seedBuild({ pkgbase: pkg });
      await e2e.seedBuild({});

      const res = await e2e.inject<{ pkgbase_pkgname: string; count: string }[]>({
        method: 'GET',
        url: '/builder/popular/10',
      });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      expect(body.length).toBeGreaterThanOrEqual(1);
    });

    it('filters by build status', async () => {
      const repo = await e2e.seedRepo({ name: 'chaotic-aur' });
      const pkg = await e2e.seedPackage({ pkgname: 'firedragon', version: '2:13.1.1', repo });
      await e2e.seedBuild({ pkgbase: pkg, status: BuildStatus.SUCCESS });
      await e2e.seedBuild({ pkgbase: pkg, status: BuildStatus.FAILED });

      const res = await e2e.inject<{ pkgbase_pkgname: string; count: string }[]>({
        method: 'GET',
        url: '/builder/popular/10?status=0',
      });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      const firedragon = body.find((r) => r.pkgbase_pkgname === 'firedragon');
      expect(firedragon?.count).toBe('1');
    });
  });

  describe('GET /builder/average/time', () => {
    it('returns average build time per status', async () => {
      await e2e.seedBuild({ status: BuildStatus.SUCCESS, timeToEnd: 1.5 });
      await e2e.seedBuild({ status: BuildStatus.SUCCESS, timeToEnd: 3.5 });

      const res = await e2e.inject<{ status: string; average_build_time: string }[]>({
        method: 'GET',
        url: '/builder/average/time',
      });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      const successRow = body.find((r) => r.status === '0');
      expect(successRow).toBeDefined();
      expect(Number(successRow?.average_build_time)).toBe(2.5);
    });

    it('filters by days lookback window', async () => {
      await e2e.seedBuild({ status: BuildStatus.SUCCESS, timeToEnd: 1.5 });

      const res = await e2e.inject<{ status: string }[]>({ method: 'GET', url: '/builder/average/time?days=7' });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      expect(body.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /builder/builders/amount', () => {
    it('returns build counts per builder', async () => {
      const builder = await e2e.seedBuilder({ name: 'immortalis-1' });
      await e2e.seedBuild({ builder });
      await e2e.seedBuild({ builder });

      const res = await e2e.inject<{ name: string; count: string }[]>({
        method: 'GET',
        url: '/builder/builders/amount',
      });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      const row = body.find((r) => r.name === 'immortalis-1');
      expect(row).toBeDefined();
      expect(row?.count).toBe('2');
    });

    it('filters by days lookback window', async () => {
      const builder = await e2e.seedBuilder({ name: 'immortalis-1' });
      await e2e.seedBuild({ builder });

      const res = await e2e.inject<{ name: string; count: string }[]>({
        method: 'GET',
        url: '/builder/builders/amount?days=7',
      });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      expect(body.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /builder/per-day/:days', () => {
    it('returns total build counts per day across all packages', async () => {
      await e2e.seedBuild({});
      await e2e.seedBuild({});

      const res = await e2e.inject<{ day: string; count: string }[]>({
        method: 'GET',
        url: '/builder/per-day/30',
      });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      expect(body.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /builder/per-day/pkgname/:pkgname/:days', () => {
    it('returns build counts per day for a specific package', async () => {
      const repo = await e2e.seedRepo({ name: 'garuda' });
      const pkg = await e2e.seedPackage({ pkgname: 'firedragon', version: '2:13.1.1', repo });
      await e2e.seedBuild({ pkgbase: pkg });
      await e2e.seedBuild({ pkgbase: pkg });

      const res = await e2e.inject<{ day: string; repo: string; count: string }[]>({
        method: 'GET',
        url: '/builder/per-day/pkgname/firedragon/30?offset=0',
      });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      expect(body.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /builder/stats/heavy-packages/:amount/:days', () => {
    it('returns packages with the highest average build time', async () => {
      const pkg1 = await e2e.seedPackage({ pkgname: 'linux-tkg' });
      const pkg2 = await e2e.seedPackage({ pkgname: 'nano' });
      await e2e.seedBuild({ pkgbase: pkg1, timeToEnd: 5000 });
      await e2e.seedBuild({ pkgbase: pkg2, timeToEnd: 10 });

      const res = await e2e.inject<{ pkgname: string; average: string }[]>({
        method: 'GET',
        url: '/builder/stats/heavy-packages/10/30',
      });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(2);
      expect(body[0].pkgname).toBe('linux-tkg');
      expect(body[1].pkgname).toBe('nano');
    });
  });

  describe('GET /builder/stats/resource/package/:pkgname/:days', () => {
    it('returns daily resource usage aggregates per build', async () => {
      const pkg = await e2e.seedPackage({ pkgname: 'linux-tkg' });
      await e2e.seedBuild({
        pkgbase: pkg,
        resourceStats: {
          avgMemoryBytes: 4_000_000_000,
          peakMemoryBytes: 6_000_000_000,
          cpuTimeNs: 3_600_000_000_000,
          diskReadBytes: 1_000_000_000,
          diskWriteBytes: 5_000_000_000,
          networkRxBytes: 100_000_000,
          networkTxBytes: 300_000_000,
          durationMs: 600_000,
          peakPids: 400,
          sampleCount: 60,
        },
      });
      await e2e.seedBuild({ pkgbase: pkg });
      await e2e.seedBuild({
        pkgbase: pkg,
        resourceStats: { avgMemoryBytes: 2_000_000_000, peakMemoryBytes: 8_000_000_000, sampleCount: 30 },
      });

      const res = await e2e.inject<
        { day: string; avg_memory_bytes: string; peak_memory_bytes: string; samples: string }[]
      >({ method: 'GET', url: '/builder/stats/resource/package/linux-tkg/30' });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(1);
      // AVG over sampled builds only; the unsampled build must not drag values down.
      expect(Number(body[0].avg_memory_bytes)).toBe(3_000_000_000);
      expect(Number(body[0].peak_memory_bytes)).toBe(8_000_000_000);
      expect(Number(body[0].samples)).toBe(2);
    });

    it('404s for unknown packages', async () => {
      const res = await e2e.inject<unknown>({ method: 'GET', url: '/builder/stats/resource/package/nope/30' });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /builder/stats/heavy-packages/resource/:metric/:amount/:days', () => {
    it('ranks packages by the requested metric', async () => {
      const hungry = await e2e.seedPackage({ pkgname: 'linux-tkg' });
      const light = await e2e.seedPackage({ pkgname: 'nano' });
      await e2e.seedBuild({
        pkgbase: hungry,
        resourceStats: {
          peakMemoryBytes: 8_000_000_000,
          cpuTimeNs: 1_000_000_000_000,
          diskReadBytes: 4_000_000_000,
          diskWriteBytes: 6_000_000_000,
          networkRxBytes: 500_000_000,
          networkTxBytes: 500_000_000,
          sampleCount: 120,
        },
      });
      await e2e.seedBuild({
        pkgbase: light,
        resourceStats: {
          peakMemoryBytes: 50_000_000,
          cpuTimeNs: 10_000_000_000,
          diskReadBytes: 1_000_000,
          diskWriteBytes: 1_000_000,
          networkRxBytes: 10_000,
          networkTxBytes: 10_000,
          sampleCount: 10,
        },
      });

      const memoryRes = await e2e.inject<{ pkgname: string; average: string }[]>({
        method: 'GET',
        url: '/builder/stats/heavy-packages/resource/memory/10/30',
      });
      expect(memoryRes.statusCode).toBe(200);
      expect((await memoryRes.json())[0].pkgname).toBe('linux-tkg');

      const diskRes = await e2e.inject<{ pkgname: string; average: string }[]>({
        method: 'GET',
        url: '/builder/stats/heavy-packages/resource/disk/10/30',
      });
      expect(diskRes.statusCode).toBe(200);
      expect(Number((await diskRes.json())[0].average)).toBe(10_000_000_000);
    });

    it('rejects unknown metrics', async () => {
      const res = await e2e.inject<unknown>({
        method: 'GET',
        url: '/builder/stats/heavy-packages/resource/bogus/10/30',
      });
      expect(res.statusCode).toBe(400);
    });

    it('ignores builds without sampling', async () => {
      await e2e.seedBuild({});

      const res = await e2e.inject<unknown[]>({
        method: 'GET',
        url: '/builder/stats/heavy-packages/resource/cpu/10/30',
      });

      expect(res.statusCode).toBe(200);
      expect(await res.json()).toEqual([]);
    });
  });

  describe('GET /builder/builds/failed/over-time/:amount/:days', () => {
    it('returns per-day failed builds for the top failing packages', async () => {
      const firefox = await e2e.seedPackage({ pkgname: 'firefox' });
      const chromium = await e2e.seedPackage({ pkgname: 'chromium' });
      const stable = await e2e.seedPackage({ pkgname: 'stable-pkg' });

      await e2e.seedBuild({ pkgbase: firefox, status: BuildStatus.FAILED });
      await e2e.seedBuild({ pkgbase: firefox, status: BuildStatus.FAILED });
      await e2e.seedBuild({ pkgbase: chromium, status: BuildStatus.TIMED_OUT });
      await e2e.seedBuild({ pkgbase: stable, status: BuildStatus.SUCCESS });

      const res = await e2e.inject<{ day: string; pkgname: string; count: string }[]>({
        method: 'GET',
        url: '/builder/builds/failed/over-time/2/30',
      });

      expect(res.statusCode).toBe(200);
      const body = await res.json();

      const firefoxCount = body
        .filter((row) => row.pkgname === 'firefox')
        .reduce((sum, row) => sum + Number(row.count), 0);
      const chromiumCount = body
        .filter((row) => row.pkgname === 'chromium')
        .reduce((sum, row) => sum + Number(row.count), 0);
      const stableCount = body.filter((row) => row.pkgname === 'stable-pkg').length;

      expect(firefoxCount).toBe(2);
      expect(chromiumCount).toBe(1);
      expect(stableCount).toBe(0);
      expect(new Set(body.map((row) => row.pkgname)).size).toBe(2);
    });

    it('returns an empty array when nothing has failed', async () => {
      await e2e.seedBuild({ status: BuildStatus.SUCCESS });

      const res = await e2e.inject<unknown[]>({
        method: 'GET',
        url: '/builder/builds/failed/over-time/5/30',
      });

      expect(res.statusCode).toBe(200);
      expect(await res.json()).toEqual([]);
    });
  });
});
