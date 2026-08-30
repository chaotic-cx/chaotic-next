import { GitlabMergeRequestService } from '@chaotic-next/backend/gitlab/gitlab-merge-request.service';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createE2eApp, type E2eApp } from '../test/e2e-app';

describe('Auth & Protected Endpoints (e2e)', () => {
  let e2e: E2eApp;

  beforeAll(async () => {
    e2e = await createE2eApp({ realAuth: true });
  });

  afterAll(async () => {
    await e2e?.close();
  });

  describe('Better Auth endpoints', () => {
    it('GET /api/auth/ok returns 200 { ok: true }', async () => {
      const res = await e2e.inject({
        method: 'GET',
        url: '/api/auth/ok',
      });

      expect(res.statusCode).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true });
    });
  });

  describe('Public endpoints (unprotected)', () => {
    it('GET /api/auth/ok is accessible without authentication (200)', async () => {
      const res = await e2e.inject({ method: 'GET', url: '/api/auth/ok' });
      expect(res.statusCode).toBe(200);
    });

    it('GET /health is accessible without authentication (200)', async () => {
      const res = await e2e.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
    });

    it('GET /health/ready is accessible without authentication (not 401)', async () => {
      const res = await e2e.inject({ method: 'GET', url: '/health/ready' });
      expect(res.statusCode).not.toBe(401);
    });

    it('GET /gitlab/pipelines is accessible without authentication (200)', async () => {
      const res = await e2e.inject({ method: 'GET', url: '/gitlab/pipelines' });
      expect(res.statusCode).toBe(200);
    });

    it('GET /gitlab/review-stats is accessible without authentication (not 401)', async () => {
      const res = await e2e.inject({ method: 'GET', url: '/gitlab/review-stats' });
      expect(res.statusCode).not.toBe(401);
    });

    it('GET /gitlab/merge-requests is accessible without authentication (200)', async () => {
      vi.spyOn(e2e.app.get(GitlabMergeRequestService), 'getOpenMergeRequests').mockResolvedValue([]);
      const res = await e2e.inject({ method: 'GET', url: '/gitlab/merge-requests' });
      expect(res.statusCode).toBe(200);
    });

    it('GET /builder/builders is accessible without authentication (200)', async () => {
      const res = await e2e.inject({ method: 'GET', url: '/builder/builders' });
      expect(res.statusCode).toBe(200);
    });

    it('GET /builder/packages is accessible without authentication (200)', async () => {
      const res = await e2e.inject({ method: 'GET', url: '/builder/packages' });
      expect(res.statusCode).toBe(200);
    });

    it('GET /builder/repos is accessible without authentication (200)', async () => {
      const res = await e2e.inject({ method: 'GET', url: '/builder/repos' });
      expect(res.statusCode).toBe(200);
    });

    it('GET /builder/builds is accessible without authentication (200)', async () => {
      const res = await e2e.inject({ method: 'GET', url: '/builder/builds' });
      expect(res.statusCode).toBe(200);
    });

    it('GET /builder/latest is accessible without authentication (200)', async () => {
      const res = await e2e.inject({ method: 'GET', url: '/builder/latest' });
      expect(res.statusCode).toBe(200);
    });

    it('GET /metrics/users is accessible without authentication (200)', async () => {
      const res = await e2e.inject({ method: 'GET', url: '/metrics/users' });
      expect(res.statusCode).toBe(200);
    });

    it('GET /metrics/user-agents is accessible without authentication (200)', async () => {
      const res = await e2e.inject({ method: 'GET', url: '/metrics/user-agents' });
      expect(res.statusCode).toBe(200);
    });

    it('GET /router/country/7 is accessible without authentication (200)', async () => {
      const res = await e2e.inject({ method: 'GET', url: '/router/country/7' });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('Protected endpoints (AuthGuard)', () => {
    it('GET /admin/packages returns 401 when unauthenticated', async () => {
      const res = await e2e.inject({ method: 'GET', url: '/admin/packages' });
      expect(res.statusCode).toBe(401);
    });

    it('PATCH /admin/packages/1 returns 401 when unauthenticated', async () => {
      const res = await e2e.inject({ method: 'PATCH', url: '/admin/packages/1', payload: {} });
      expect(res.statusCode).toBe(401);
    });

    it('DELETE /admin/packages/1 returns 401 when unauthenticated', async () => {
      const res = await e2e.inject({ method: 'DELETE', url: '/admin/packages/1' });
      expect(res.statusCode).toBe(401);
    });

    it('POST /admin/repos returns 401 when unauthenticated', async () => {
      const res = await e2e.inject({ method: 'POST', url: '/admin/repos', payload: {} });
      expect(res.statusCode).toBe(401);
    });

    it('PATCH /admin/repos/1 returns 401 when unauthenticated', async () => {
      const res = await e2e.inject({ method: 'PATCH', url: '/admin/repos/1', payload: {} });
      expect(res.statusCode).toBe(401);
    });

    it('DELETE /admin/repos/1 returns 401 when unauthenticated', async () => {
      const res = await e2e.inject({ method: 'DELETE', url: '/admin/repos/1' });
      expect(res.statusCode).toBe(401);
    });

    it('DELETE /admin/arch-packages/1 returns 401 when unauthenticated', async () => {
      const res = await e2e.inject({ method: 'DELETE', url: '/admin/arch-packages/1' });
      expect(res.statusCode).toBe(401);
    });

    it('POST /gitlab/approve returns 401 when unauthenticated', async () => {
      const res = await e2e.inject({
        method: 'POST',
        url: '/gitlab/approve',
        payload: { iid: 1, sha: '4a70b438f76d5c8f6f739ea110f8c071efe8067f' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('POST /gitlab/flag returns 401 when unauthenticated', async () => {
      const res = await e2e.inject({
        method: 'POST',
        url: '/gitlab/flag',
        payload: { iid: 1, label: 'hold' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('POST /gitlab/trigger returns 401 when unauthenticated', async () => {
      const res = await e2e.inject({
        method: 'POST',
        url: '/gitlab/trigger',
        payload: { operation: 'bump-packages', packages: 'nodejs:20' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('GET /repo/run returns 401 when unauthenticated', async () => {
      const res = await e2e.inject({ method: 'GET', url: '/repo/run' });
      expect(res.statusCode).toBe(401);
    });

    it('GET /repo/signal-scan returns 401 when unauthenticated', async () => {
      const res = await e2e.inject({ method: 'GET', url: '/repo/signal-scan' });
      expect(res.statusCode).toBe(401);
    });

    it('GET /repo/broken returns 401 when unauthenticated', async () => {
      const res = await e2e.inject({ method: 'GET', url: '/repo/broken' });
      expect(res.statusCode).toBe(401);
    });

    it('POST /repo/index/arch returns 401 when unauthenticated', async () => {
      const res = await e2e.inject({ method: 'POST', url: '/repo/index/arch' });
      expect(res.statusCode).toBe(401);
    });

    it('POST /repo/index/chaotic returns 401 when unauthenticated', async () => {
      const res = await e2e.inject({
        method: 'POST',
        url: '/repo/index/chaotic',
        payload: { url: 'http://test' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('GET /repo/dependencies returns 401 when unauthenticated', async () => {
      const res = await e2e.inject({ method: 'GET', url: '/repo/dependencies' });
      expect(res.statusCode).toBe(401);
    });

    it('GET /repo/dependencies/firedragon returns 401 when unauthenticated', async () => {
      const res = await e2e.inject({ method: 'GET', url: '/repo/dependencies/firedragon' });
      expect(res.statusCode).toBe(401);
    });

    it('GET /repo/update-db returns 401 when unauthenticated', async () => {
      const res = await e2e.inject({ method: 'GET', url: '/repo/update-db' });
      expect(res.statusCode).toBe(401);
    });
  });
});
