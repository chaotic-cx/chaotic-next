import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { encryptAes } from '@chaotic-next/backend/utils/functions';
import { createE2eApp, type E2eApp } from '../test/e2e-app';

const DB_KEY = process.env.CAUR_DB_KEY ?? '00000000000000000000000000000000';

describe('Build API proxy endpoints (e2e)', () => {
  let e2e: E2eApp;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    e2e = await createE2eApp();
  });

  afterAll(async () => {
    await e2e.close();
  });

  beforeEach(async () => {
    await e2e.resetTables();
    await e2e.seedRepo({
      name: 'chaotic-aur',
      gitlabProjectId: '123456',
      apiToken: encryptAes('test-gitlab-token', DB_KEY),
    });
    fetchSpy = vi.fn().mockImplementation((url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
      if (urlStr.includes('gitlab.com/api/v4')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => [{ id: 'abc123def456' }] } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ status: 'queued' }),
      } as Response);
    });
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function findBuildServerCall(): unknown[] {
    return (
      fetchSpy.mock.calls.find((call: unknown[]) => {
        const url = typeof call[0] === 'string' ? call[0] : '';
        return url.includes('builds.garudalinux.org');
      }) ?? []
    );
  }

  describe('POST /api/queue/schedule', () => {
    it('proxies a valid schedule request to the build server', async () => {
      const res = await e2e.inject({
        method: 'POST',
        url: '/api/queue/schedule',
        payload: { packages: ['firedragon'] },
      });

      expect(res.statusCode).toBe(201);
      const body = await res.json();
      expect(body).toEqual({ status: 'queued' });

      const [, init] = findBuildServerCall();
      expect((init as RequestInit).method).toBe('POST');

      const sentBody = JSON.parse((init as RequestInit).body as string) as Record<string, unknown>;
      expect(sentBody.arch).toBe('x86_64');
      expect(sentBody.source_repo).toBe('chaotic-aur');
      expect(sentBody.target_repo).toBe('chaotic-aur');
      expect(sentBody.packages).toEqual([{ pkgbase: 'firedragon' }]);
    });

    it('forwards source_repo and target_repo from the request', async () => {
      await e2e.seedRepo({
        name: 'garuda',
        gitlabProjectId: '789012',
        apiToken: encryptAes('test-gitlab-token', DB_KEY),
      });

      const res = await e2e.inject({
        method: 'POST',
        url: '/api/queue/schedule',
        payload: { packages: ['paru'], source_repo: 'garuda', target_repo: 'chaotic-aur' },
      });

      expect(res.statusCode).toBe(201);

      const [, init] = findBuildServerCall();
      const sentBody = JSON.parse((init as RequestInit).body as string) as Record<string, unknown>;
      expect(sentBody.source_repo).toBe('garuda');
      expect(sentBody.target_repo).toBe('chaotic-aur');
    });

    it('sends multiple packages in a single request', async () => {
      const res = await e2e.inject({
        method: 'POST',
        url: '/api/queue/schedule',
        payload: { packages: ['firedragon', 'paru', 'yay'] },
      });

      expect(res.statusCode).toBe(201);

      const [, init] = findBuildServerCall();
      const sentBody = JSON.parse((init as RequestInit).body as string) as Record<string, unknown>;
      expect(sentBody.packages).toEqual([{ pkgbase: 'firedragon' }, { pkgbase: 'paru' }, { pkgbase: 'yay' }]);
    });

    it('returns 400 when no commit can be determined', async () => {
      const res = await e2e.inject({
        method: 'POST',
        url: '/api/queue/schedule',
        payload: { packages: ['firedragon'], source_repo: 'nonexistent-repo' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when packages is missing', async () => {
      const res = await e2e.inject({
        method: 'POST',
        url: '/api/queue/schedule',
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns 400 when packages is empty', async () => {
      const res = await e2e.inject({
        method: 'POST',
        url: '/api/queue/schedule',
        payload: { packages: [] },
      });

      expect(res.statusCode).toBe(400);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns 503 when the build server is unreachable', async () => {
      fetchSpy.mockImplementation((url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
        if (urlStr.includes('gitlab.com/api/v4')) {
          return Promise.resolve({ ok: true, status: 200, json: async () => [{ id: 'abc123' }] } as Response);
        }
        return Promise.reject(new Error('ECONNREFUSED'));
      });

      const res = await e2e.inject({
        method: 'POST',
        url: '/api/queue/schedule',
        payload: { packages: ['firedragon'] },
      });

      expect(res.statusCode).toBe(503);
    });

    it('returns 503 when the build server returns a non-OK status', async () => {
      fetchSpy.mockImplementation((url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
        if (urlStr.includes('gitlab.com/api/v4')) {
          return Promise.resolve({ ok: true, status: 200, json: async () => [{ id: 'abc123' }] } as Response);
        }
        return Promise.resolve({ ok: false, status: 500, text: async () => 'Internal Server Error' } as Response);
      });

      const res = await e2e.inject({
        method: 'POST',
        url: '/api/queue/schedule',
        payload: { packages: ['firedragon'] },
      });

      expect(res.statusCode).toBe(503);
    });

    it('returns 404 when the build server returns 404', async () => {
      fetchSpy.mockImplementation((url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
        if (urlStr.includes('gitlab.com/api/v4')) {
          return Promise.resolve({ ok: true, status: 200, json: async () => [{ id: 'abc123' }] } as Response);
        }
        return Promise.resolve({ ok: false, status: 404, text: async () => 'Not Found' } as Response);
      });

      const res = await e2e.inject({
        method: 'POST',
        url: '/api/queue/schedule',
        payload: { packages: ['firedragon'] },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/queue/promote', () => {
    it('proxies a valid promote request to the build server', async () => {
      const res = await e2e.inject({
        method: 'POST',
        url: '/api/queue/promote',
        payload: { pkgbase: 'firedragon', arch: 'x86_64', target_repo: 'garuda' },
      });

      expect(res.statusCode).toBe(201);
      const body = await res.json();
      expect(body).toEqual({ status: 'queued' });

      const [, init] = findBuildServerCall();
      expect((init as RequestInit).method).toBe('POST');

      const sentBody = JSON.parse((init as RequestInit).body as string) as Record<string, unknown>;
      expect(sentBody).toEqual({ pkgbase: 'firedragon', arch: 'x86_64', target_repo: 'garuda' });
    });

    it('returns 400 when pkgbase is missing', async () => {
      const res = await e2e.inject({
        method: 'POST',
        url: '/api/queue/promote',
        payload: { arch: 'x86_64', target_repo: 'garuda' },
      });

      expect(res.statusCode).toBe(400);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns 400 when arch is missing', async () => {
      const res = await e2e.inject({
        method: 'POST',
        url: '/api/queue/promote',
        payload: { pkgbase: 'firedragon', target_repo: 'garuda' },
      });

      expect(res.statusCode).toBe(400);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns 400 when target_repo is missing', async () => {
      const res = await e2e.inject({
        method: 'POST',
        url: '/api/queue/promote',
        payload: { pkgbase: 'firedragon', arch: 'x86_64' },
      });

      expect(res.statusCode).toBe(400);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns 503 when the build server is unreachable', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const res = await e2e.inject({
        method: 'POST',
        url: '/api/queue/promote',
        payload: { pkgbase: 'firedragon', arch: 'x86_64', target_repo: 'garuda' },
      });

      expect(res.statusCode).toBe(503);
    });
  });
});
