import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createE2eApp, type E2eApp } from '../test/e2e-app';
import { routerHit, USER_AGENTS } from '../test/fixtures';

describe('Metrics endpoints (e2e, real PostgreSQL)', () => {
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

  describe('GET /metrics/users', () => {
    it('returns distinct user (IP) count for the lookback window', async () => {
      await e2e.seedRouterHits([
        routerHit({ ip: '203.0.113.1' }),
        routerHit({ ip: '203.0.113.1' }),
        routerHit({ ip: '198.51.100.5' }),
        routerHit({ ip: '198.51.100.5' }),
        routerHit({ ip: '198.51.100.5' }),
      ]);

      const res = await e2e.inject<number | string>({ method: 'GET', url: '/metrics/users?days=30' });

      expect(res.statusCode).toBe(200);
      expect(Number(await res.json())).toBe(2);
    });

    it('returns 0 when no router-hits exist', async () => {
      const res = await e2e.inject<number | string>({ method: 'GET', url: '/metrics/users?days=30' });
      expect(res.statusCode).toBe(200);
      expect(Number(await res.json())).toBe(0);
    });
  });

  describe('GET /metrics/rank/:range/packages', () => {
    it('returns top packages ranked by hit count', async () => {
      await e2e.seedRouterHits([
        routerHit({ package: 'firedragon' }),
        routerHit({ package: 'firedragon' }),
        routerHit({ package: 'firedragon' }),
        routerHit({ package: 'google-chrome' }),
        routerHit({ package: 'google-chrome' }),
        routerHit({ package: 'spotify' }),
      ]);

      const res = await e2e.inject<Array<{ name: string; count: string }>>({
        method: 'GET',
        url: '/metrics/rank/10/packages?days=30',
      });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(3);
      expect(body[0].name).toBe('firedragon');
      expect(Number(body[0].count)).toBe(3);
      expect(body[1].name).toBe('google-chrome');
      expect(Number(body[1].count)).toBe(2);
      expect(body[2].name).toBe('spotify');
      expect(Number(body[2].count)).toBe(1);
    });

    it('limits results to the requested range', async () => {
      await e2e.seedRouterHits([
        routerHit({ package: 'firedragon' }),
        routerHit({ package: 'google-chrome' }),
        routerHit({ package: 'spotify' }),
      ]);

      const res = await e2e.inject<unknown[]>({ method: 'GET', url: '/metrics/rank/2/packages?days=30' });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(2);
    });
  });

  describe('GET /metrics/rank/:range/countries', () => {
    it('returns top countries ranked by hit count', async () => {
      await e2e.seedRouterHits([
        routerHit({ country: 'DE' }),
        routerHit({ country: 'DE' }),
        routerHit({ country: 'US' }),
      ]);

      const res = await e2e.inject<Array<{ name: string; count: string }>>({
        method: 'GET',
        url: '/metrics/rank/10/countries?days=30',
      });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      expect(body[0].name).toBe('DE');
    });
  });

  describe('GET /metrics/package/:package', () => {
    it('returns per-package metrics for a valid package name', async () => {
      await e2e.seedRouterHits([
        routerHit({ package: 'firedragon', country: 'DE' }),
        routerHit({ package: 'firedragon', country: 'US' }),
      ]);

      const res = await e2e.inject<{ name: string; downloads: number; user_agents: unknown[] }>({
        method: 'GET',
        url: '/metrics/package/firedragon?days=30',
      });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      expect(body.name).toBe('firedragon');
      expect(Number(body.downloads)).toBe(2);
      expect(Array.isArray(body.user_agents)).toBe(true);
    });

    it('rejects an invalid package name with 400', async () => {
      const res = await e2e.inject({ method: 'GET', url: '/metrics/package/bad%20name?days=30' });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /metrics/rank/:range/packages — validation', () => {
    it('rejects a range above 200 with 400', async () => {
      const res = await e2e.inject({ method: 'GET', url: '/metrics/rank/999/packages?days=30' });
      expect(res.statusCode).toBe(400);
    });

    it('rejects a range below 1 with 400', async () => {
      const res = await e2e.inject({ method: 'GET', url: '/metrics/rank/0/packages?days=30' });
      expect(res.statusCode).toBe(400);
    });

    it('rejects a non-numeric range with 400', async () => {
      const res = await e2e.inject({ method: 'GET', url: '/metrics/rank/abc/packages?days=30' });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /metrics/rank/:range/countries — validation', () => {
    it('rejects a range above 200 with 400', async () => {
      const res = await e2e.inject({ method: 'GET', url: '/metrics/rank/999/countries?days=30' });
      expect(res.statusCode).toBe(400);
    });

    it('rejects a range below 1 with 400', async () => {
      const res = await e2e.inject({ method: 'GET', url: '/metrics/rank/0/countries?days=30' });
      expect(res.statusCode).toBe(400);
    });

    it('rejects a non-numeric range with 400', async () => {
      const res = await e2e.inject({ method: 'GET', url: '/metrics/rank/abc/countries?days=30' });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('days lookback window', () => {
    it('excludes hits outside a narrow days=1 window', async () => {
      const recent = new Date();
      const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      await e2e.seedRouterHits([
        routerHit({ ip: '203.0.113.1', timestamp: recent }),
        routerHit({ ip: '198.51.100.2', timestamp: old }),
      ]);

      const res = await e2e.inject<number | string>({ method: 'GET', url: '/metrics/users?days=1' });

      expect(res.statusCode).toBe(200);
      expect(Number(await res.json())).toBe(1);
    });
  });

  describe('GET /metrics/user-agents', () => {
    it('returns user-agent aggregation', async () => {
      await e2e.seedRouterHits([
        routerHit({ userAgent: USER_AGENTS[0] }),
        routerHit({ userAgent: USER_AGENTS[0] }),
        routerHit({ userAgent: USER_AGENTS[3] }),
      ]);

      const res = await e2e.inject<Array<{ name: string; count: number }>>({
        method: 'GET',
        url: '/metrics/user-agents?days=30',
      });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      const first = body.find((r) => r.name === USER_AGENTS[0]);
      const fourth = body.find((r) => r.name === USER_AGENTS[3]);
      expect(first).toBeDefined();
      expect(Number(first?.count)).toBe(2);
      expect(fourth).toBeDefined();
      expect(Number(fourth?.count)).toBe(1);
    });
  });
});
