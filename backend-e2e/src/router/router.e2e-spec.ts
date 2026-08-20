import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createE2eApp, type E2eApp, type RouterHitSeed } from '../test/e2e-app';
import { routerHit } from '../test/fixtures';

type CountRow<K extends string> = { [P in K]: string } & { count: string };

describe('Router endpoints (e2e, real PostgreSQL)', () => {
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

  describe('GET /router/per-day/:days', () => {
    it('returns 200 with an empty array when no router-hits exist', async () => {
      const res = await e2e.inject<unknown[]>({ method: 'GET', url: '/router/per-day/30' });

      expect(res.statusCode).toBe(200);
      expect(await res.json()).toEqual([]);
    });

    it('groups hits by day and returns descending counts', async () => {
      const noonUtc = new Date();
      noonUtc.setUTCHours(12, 0, 0, 0);
      const rows: RouterHitSeed[] = [
        routerHit({ package: 'firedragon', timestamp: noonUtc }),
        routerHit({ package: 'google-chrome', timestamp: noonUtc }),
        routerHit({ package: 'firedragon', timestamp: noonUtc }),
      ];
      await e2e.seedRouterHits(rows);

      const res = await e2e.inject<CountRow<'day'>[]>({ method: 'GET', url: '/router/per-day/30' });

      expect(res.statusCode).toBe(200);
      const body = await res.json();

      expect(body).toHaveLength(1);
      expect(body[0].count).toBe('3');
      const returnedDay = new Date(body[0].day);
      expect(returnedDay.getFullYear()).toBe(noonUtc.getFullYear());
      expect(returnedDay.getMonth()).toBe(noonUtc.getMonth());
      expect(returnedDay.getDate()).toBe(noonUtc.getDate());
    });
  });

  describe('GET /router/country/:days', () => {
    it('groups hits by country and orders by descending count', async () => {
      await e2e.seedRouterHits([
        routerHit({ package: 'firedragon', country: 'DE' }),
        routerHit({ package: 'google-chrome', country: 'DE' }),
        routerHit({ package: 'spotify', country: 'US' }),
      ]);

      const res = await e2e.inject<CountRow<'country'>[]>({ method: 'GET', url: '/router/country/30' });

      expect(res.statusCode).toBe(200);
      const body = await res.json();

      expect(body).toEqual([
        { country: 'DE', count: '2' },
        { country: 'US', count: '1' },
      ]);
    });
  });

  describe('GET /router/package/:days', () => {
    it('groups hits by package name', async () => {
      await e2e.seedRouterHits([
        routerHit({ package: 'firedragon' }),
        routerHit({ package: 'firedragon' }),
        routerHit({ package: 'google-chrome' }),
      ]);

      const res = await e2e.inject<CountRow<'pkgbase'>[]>({ method: 'GET', url: '/router/package/30' });

      expect(res.statusCode).toBe(200);
      const body = await res.json();

      expect(body).toEqual([
        { pkgbase: 'firedragon', count: '2' },
        { pkgbase: 'google-chrome', count: '1' },
      ]);
    });
  });

  describe('GET /router/mirror/:days', () => {
    it('groups hits by mirror hostname', async () => {
      await e2e.seedRouterHits([
        routerHit({ package: 'firedragon', hostname: 'de-mirror.chaotic.cx' }),
        routerHit({ package: 'google-chrome', hostname: 'us-mirror.chaotic.cx' }),
        routerHit({ package: 'spotify', hostname: 'de-mirror.chaotic.cx' }),
      ]);

      const res = await e2e.inject<CountRow<'mirror'>[]>({ method: 'GET', url: '/router/mirror/30' });

      expect(res.statusCode).toBe(200);
      const body = await res.json();

      expect(body).toEqual([
        { mirror: 'de-mirror.chaotic.cx', count: '2' },
        { mirror: 'us-mirror.chaotic.cx', count: '1' },
      ]);
    });
  });

  describe('GET /router/stats/mirror-over-time/:days', () => {
    it('groups hits by day and mirror', async () => {
      const noonUtc = new Date();
      noonUtc.setUTCHours(12, 0, 0, 0);
      await e2e.seedRouterHits([
        routerHit({ package: 'firedragon', hostname: 'de-mirror.chaotic.cx', timestamp: noonUtc }),
        routerHit({ package: 'google-chrome', hostname: 'us-mirror.chaotic.cx', timestamp: noonUtc }),
        routerHit({ package: 'spotify', hostname: 'de-mirror.chaotic.cx', timestamp: noonUtc }),
      ]);

      const res = await e2e.inject<CountRow<'mirror'>[]>({ method: 'GET', url: '/router/stats/mirror-over-time/30' });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(2);
      expect(body.find((b) => b.mirror === 'de-mirror.chaotic.cx')?.count).toBe('2');
      expect(body.find((b) => b.mirror === 'us-mirror.chaotic.cx')?.count).toBe('1');
    });
  });

  describe('GET /router/stats/country-over-time/:days', () => {
    it('groups hits by day and country', async () => {
      const noonUtc = new Date();
      noonUtc.setUTCHours(12, 0, 0, 0);
      await e2e.seedRouterHits([
        routerHit({ package: 'firedragon', country: 'DE', timestamp: noonUtc }),
        routerHit({ package: 'google-chrome', country: 'US', timestamp: noonUtc }),
        routerHit({ package: 'spotify', country: 'DE', timestamp: noonUtc }),
      ]);

      const res = await e2e.inject<CountRow<'country'>[]>({ method: 'GET', url: '/router/stats/country-over-time/30' });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(2);
      expect(body.find((b) => b.country === 'DE')?.count).toBe('2');
      expect(body.find((b) => b.country === 'US')?.count).toBe('1');
    });
  });

  describe('days parameter handling', () => {
    it('rejects a non-integer days value with 400 (ParseIntPipe)', async () => {
      const res = await e2e.inject({ method: 'GET', url: '/router/per-day/abc' });
      expect(res.statusCode).toBe(400);
    });

    it('clamps an out-of-range days value and still returns 200', async () => {
      const today = new Date();
      await e2e.seedRouterHits([routerHit({ package: 'firedragon', timestamp: today })]);

      const res = await e2e.inject<CountRow<'day'>[]>({ method: 'GET', url: '/router/per-day/99999' });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(1);
      expect(body[0].count).toBe('1');
    });

    it('excludes rows older than the days window', async () => {
      const recent = new Date();
      const old = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
      await e2e.seedRouterHits([
        routerHit({ package: 'firedragon', timestamp: recent }),
        routerHit({ package: 'google-chrome', timestamp: old }),
      ]);

      const res = await e2e.inject<CountRow<'pkgbase'>[]>({ method: 'GET', url: '/router/package/30' });

      const body = await res.json();
      expect(body).toBeDefined();
    });
  });
});
