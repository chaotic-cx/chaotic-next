import { BuilderService } from '@chaotic-next/backend/builder/builder.service';
import { BuildStatus } from '@chaotic-next/backend/types/types';
import type { UnresolvedFailedBuild } from '@chaotic-next/shared-lib';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createE2eApp, type E2eApp } from '../test/e2e-app';

const HOUR_MS = 60 * 60 * 1000;
const GROUPS_HEADER = 'x-test-user-groups';
const CHAOTIC_AUR_GROUP = 'chaotic-aur';

describe('Build insights endpoints (e2e, real PostgreSQL)', () => {
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

  async function seedFailures(pkgname: string, count: number, ageMs = 0): Promise<void> {
    const pkg = await e2e.seedPackage({ pkgname, version: '1.0', pkgrel: 1 });
    for (let index = 0; index < count; index++) {
      await e2e.seedBuild({
        pkgbase: pkg,
        status: BuildStatus.FAILED,
        timestamp: new Date(Date.now() - ageMs - index * 60_000).toISOString(),
      });
    }
  }

  describe('GET /builder/builds/failed/unresolved', () => {
    it('lists failing packages with their streak and silence state', async () => {
      await seedFailures('flappy-pkg', 6);
      await e2e.dataSource.query(`INSERT INTO silenced_build_failure (pkgname) VALUES ('muted-pkg')`);
      await seedFailures('muted-pkg', 2);

      const res = await e2e.inject<UnresolvedFailedBuild[]>({
        method: 'GET',
        url: '/builder/builds/failed/unresolved',
      });

      expect(res.statusCode).toBe(200);
      const byName = new Map((await res.json()).map((row: UnresolvedFailedBuild) => [row.pkgname, row]));
      const flappy = byName.get('flappy-pkg');
      expect(flappy).toMatchObject({ consecutiveFailures: 6, silenced: false });
      // The streak start is the oldest of the six seeded failures.
      expect(Number.isNaN(Date.parse(flappy?.streakStartedAt ?? ''))).toBe(false);
      expect(byName.get('muted-pkg')).toMatchObject({ consecutiveFailures: 2, silenced: true });
    });

    it('excludes resolved packages and inactive packages', async () => {
      const healthy = await e2e.seedPackage({ pkgname: 'healthy-pkg', version: '1.0', pkgrel: 1 });
      await e2e.seedBuild({ pkgbase: healthy, status: BuildStatus.SUCCESS });
      const removed = await e2e.seedPackage({ pkgname: 'removed-pkg', version: '1.0', pkgrel: 1, isActive: false });
      await e2e.seedBuild({ pkgbase: removed, status: BuildStatus.FAILED });

      const res = await e2e.inject<UnresolvedFailedBuild[]>({
        method: 'GET',
        url: '/builder/builds/failed/unresolved',
      });

      expect(res.statusCode).toBe(200);
      expect((await res.json()).map((row: UnresolvedFailedBuild) => row.pkgname)).toEqual([]);
    });

    it('honors the days query param as the verdict lookback window', async () => {
      const ancient = await e2e.seedPackage({ pkgname: 'ancient-failer', version: '1.0', pkgrel: 1 });
      await e2e.seedBuild({
        pkgbase: ancient,
        status: BuildStatus.FAILED,
        timestamp: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString(),
      });

      const defaulted = await e2e.inject<UnresolvedFailedBuild[]>({
        method: 'GET',
        url: '/builder/builds/failed/unresolved',
      });
      expect((await defaulted.json()).map((row: UnresolvedFailedBuild) => row.pkgname)).toEqual([]);

      const widened = await e2e.inject<UnresolvedFailedBuild[]>({
        method: 'GET',
        url: '/builder/builds/failed/unresolved?days=3650',
      });
      expect((await widened.json()).map((row: UnresolvedFailedBuild) => row.pkgname)).toEqual(['ancient-failer']);
    });
  });

  describe('GET /builder/builds/failed/top/:amount', () => {
    it('limits the window via the days query param', async () => {
      const old = await e2e.seedPackage({ pkgname: 'old-failer', version: '1.0', pkgrel: 1 });
      const fresh = await e2e.seedPackage({ pkgname: 'fresh-failer', version: '1.0', pkgrel: 1 });
      await e2e.seedBuild({
        pkgbase: old,
        status: BuildStatus.FAILED,
        timestamp: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      });
      await e2e.seedBuild({ pkgbase: fresh, status: BuildStatus.FAILED });

      const allTime = await e2e.inject<{ pkgname: string }[]>({
        method: 'GET',
        url: '/builder/builds/failed/top/10',
      });
      expect((await allTime.json()).map((row) => row.pkgname).sort()).toEqual(['fresh-failer', 'old-failer']);

      const windowed = await e2e.inject<{ pkgname: string }[]>({
        method: 'GET',
        url: '/builder/builds/failed/top/10?days=7',
      });
      expect((await windowed.json()).map((row) => row.pkgname)).toEqual(['fresh-failer']);
    });
  });

  describe('GET /builder/should-build/:pkgbase', () => {
    it('allows building a package without failures', async () => {
      const pkg = await e2e.seedPackage({ pkgname: 'healthy-pkg', version: '1.0', pkgrel: 1 });
      await e2e.seedBuild({ pkgbase: pkg, status: BuildStatus.SUCCESS });

      const res = await e2e.inject<{ shouldBuild: boolean; consecutiveFailures: number }>({
        method: 'GET',
        url: '/builder/should-build/healthy-pkg',
      });

      expect(res.statusCode).toBe(200);
      expect(await res.json()).toEqual({ shouldBuild: true, consecutiveFailures: 0 });
    });

    it('blocks a fresh failure loop', async () => {
      await seedFailures('flappy-pkg', 6);

      const res = await e2e.inject<{ shouldBuild: boolean; consecutiveFailures: number }>({
        method: 'GET',
        url: '/builder/should-build/flappy-pkg',
      });

      expect(res.statusCode).toBe(200);
      expect(await res.json()).toEqual({ shouldBuild: false, consecutiveFailures: 6 });
    });

    it('retries a blocked package once its newest failure is older than the cooldown', async () => {
      await seedFailures('stale-failer', 6, 25 * HOUR_MS);

      const res = await e2e.inject<{ shouldBuild: boolean; consecutiveFailures: number }>({
        method: 'GET',
        url: '/builder/should-build/stale-failer',
      });

      expect(res.statusCode).toBe(200);
      expect(await res.json()).toEqual({ shouldBuild: true, consecutiveFailures: 6 });
    });

    it('covers split packages through their pkgbase name', async () => {
      const lib = await e2e.seedPackage({
        pkgname: 'llvm-libs',
        version: '1.0',
        pkgrel: 1,
        pkgbaseName: 'llvm',
      });
      for (let index = 0; index < 6; index++) {
        await e2e.seedBuild({ pkgbase: lib, status: BuildStatus.FAILED });
      }

      const res = await e2e.inject<{ shouldBuild: boolean }>({
        method: 'GET',
        url: '/builder/should-build/llvm',
      });

      expect(res.statusCode).toBe(200);
      expect((await res.json()).shouldBuild).toBe(false);
    });

    it('answers 400 for an invalid package name', async () => {
      const res = await e2e.inject({ method: 'GET', url: '/builder/should-build/bad%20name' });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /builder/stats/flaky-packages/:days', () => {
    it('computes failure rates from genuine attempts only', async () => {
      const flaky = await e2e.seedPackage({ pkgname: 'flaky-pkg', version: '1.0', pkgrel: 1 });
      for (let index = 0; index < 3; index++) await e2e.seedBuild({ pkgbase: flaky, status: BuildStatus.FAILED });
      for (let index = 0; index < 2; index++) await e2e.seedBuild({ pkgbase: flaky, status: BuildStatus.SUCCESS });
      // Requeues must not inflate the attempt count.
      await e2e.seedBuild({ pkgbase: flaky, status: BuildStatus.CANCELED_REQUEUE });

      const solid = await e2e.seedPackage({ pkgname: 'solid-pkg', version: '1.0', pkgrel: 1 });
      for (let index = 0; index < 6; index++) await e2e.seedBuild({ pkgbase: solid, status: BuildStatus.SUCCESS });

      // Never succeeding means broken, not flaky — that is the unresolved list's job.
      const broken = await e2e.seedPackage({ pkgname: 'broken-pkg', version: '1.0', pkgrel: 1 });
      for (let index = 0; index < 6; index++) await e2e.seedBuild({ pkgbase: broken, status: BuildStatus.FAILED });

      // Below the minimum attempt count: never qualifies.
      const young = await e2e.seedPackage({ pkgname: 'young-pkg', version: '1.0', pkgrel: 1 });
      for (let index = 0; index < 2; index++) await e2e.seedBuild({ pkgbase: young, status: BuildStatus.FAILED });

      const res = await e2e.inject<{ pkgname: string; attempts: number; failures: number; flakiness: number }[]>({
        method: 'GET',
        url: '/builder/stats/flaky-packages/7',
      });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      const byName = new Map(body.map((row) => [row.pkgname, row]));
      expect(byName.get('flaky-pkg')).toEqual({ pkgname: 'flaky-pkg', attempts: 5, failures: 3, flakiness: 0.6 });
      expect(byName.has('solid-pkg')).toBe(false);
      expect(byName.has('broken-pkg')).toBe(false);
      expect(byName.has('young-pkg')).toBe(false);
    });

    it('returns an empty list without builds', async () => {
      const svc = e2e.app.get(BuilderService);
      try {
        await svc.getFlakiestPackages({ days: 7 });
      } catch (err) {
        console.log('DEBUG-ERR:', JSON.stringify(err, Object.getOwnPropertyNames(err)), err);
      }
      const res = await e2e.inject({ method: 'GET', url: '/builder/stats/flaky-packages/7' });
      expect(res.statusCode).toBe(200);
      expect(await res.json()).toEqual([]);
    });
  });

  describe('GET /builder/stats/builder-utilization/:days', () => {
    it('aggregates builds per builder and UTC hour of day', async () => {
      const alpha = await e2e.seedBuilder({ name: 'alpha-1' });
      const beta = await e2e.seedBuilder({ name: 'beta-1' });
      const pkg = await e2e.seedPackage({ pkgname: 'utilized-pkg', version: '1.0', pkgrel: 1 });

      // Naive timestamp strings are stored verbatim, so the seeded hours stay
      // deterministic no matter which timezone the test machine runs in.
      for (let index = 0; index < 3; index++) {
        await e2e.seedBuild({
          pkgbase: pkg,
          builder: alpha,
          status: BuildStatus.SUCCESS,
          timestamp: '2026-08-20T05:30:00',
          commit: `alpha-commit-${index}`,
        });
      }
      // A requeued build with an already-seen commit must not inflate the bucket.
      await e2e.seedBuild({
        pkgbase: pkg,
        builder: alpha,
        status: BuildStatus.ALREADY_BUILT,
        timestamp: '2026-08-20T05:45:00',
        commit: 'alpha-commit-0',
      });
      await e2e.seedBuild({
        pkgbase: pkg,
        builder: beta,
        status: BuildStatus.FAILED,
        timestamp: '2026-08-21T09:15:00',
        commit: 'beta-commit-0',
      });

      const res = await e2e.inject<{ builder: string; hour: number; count: number }[]>({
        method: 'GET',
        url: '/builder/stats/builder-utilization/7',
      });

      expect(res.statusCode).toBe(200);
      expect(await res.json()).toEqual([
        { builder: 'alpha-1', hour: 5, count: 3 },
        { builder: 'beta-1', hour: 9, count: 1 },
      ]);
    });

    it('returns an empty list without builds', async () => {
      const res = await e2e.inject({ method: 'GET', url: '/builder/stats/builder-utilization/7' });
      expect(res.statusCode).toBe(200);
      expect(await res.json()).toEqual([]);
    });
  });

  describe('silence endpoints', () => {
    const silenceUrl = (pkgname: string): string => `/builder/builds/failed/unresolved/${pkgname}/silence`;

    it('requires the chaotic-aur group for silencing', async () => {
      const anonymous = await e2e.inject({ method: 'POST', url: silenceUrl('some-pkg') });
      expect([401, 403]).toContain(anonymous.statusCode);

      const wrongGroup = await e2e.inject({
        method: 'POST',
        url: silenceUrl('some-pkg'),
        headers: { [GROUPS_HEADER]: 'garuda-linux' },
      });
      expect(wrongGroup.statusCode).toBe(403);
    });

    it('creates and removes a silence for a group member', async () => {
      const headers = { [GROUPS_HEADER]: CHAOTIC_AUR_GROUP };

      const created = await e2e.inject({ method: 'POST', url: silenceUrl('flappy-pkg'), headers });
      expect(created.statusCode).toBe(204);
      const rows = await e2e.dataSource.query(`SELECT pkgname FROM silenced_build_failure`);
      expect(rows.map((row: { pkgname: string }) => row.pkgname)).toEqual(['flappy-pkg']);

      // Re-silencing stays idempotent instead of failing on the unique index.
      const again = await e2e.inject({ method: 'POST', url: silenceUrl('flappy-pkg'), headers });
      expect(again.statusCode).toBe(204);

      const removed = await e2e.inject({ method: 'DELETE', url: silenceUrl('flappy-pkg'), headers });
      expect(removed.statusCode).toBe(204);
      const remaining = await e2e.dataSource.query(`SELECT COUNT(*)::int AS c FROM silenced_build_failure`);
      expect(remaining[0].c).toBe(0);
    });

    it('rejects invalid package names', async () => {
      const res = await e2e.inject({
        method: 'POST',
        url: silenceUrl('bad%20name'),
        headers: { [GROUPS_HEADER]: CHAOTIC_AUR_GROUP },
      });
      expect(res.statusCode).toBe(400);
    });
  });
});
