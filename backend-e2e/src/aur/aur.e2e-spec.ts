import 'reflect-metadata';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createE2eApp, type E2eApp } from '../test/e2e-app';

describe('GET /aur/suggestions (e2e, mocked AUR upstream)', () => {
  let e2e: E2eApp;
  let fetchMock: Mock<typeof fetch>;

  beforeAll(async () => {
    // Only the AUR upstream is mocked; every other fetch goes through unchanged.
    const realFetch = globalThis.fetch;
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).includes('aur.archlinux.org') ? fetchMock(input, init) : realFetch(input, init),
    );

    e2e = await createE2eApp();
  });

  afterAll(async () => {
    await e2e.close();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    // Configured here because the vitest config resets mocks between tests.
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ['paru', 'paru-git'],
    } as Response);
  });

  it('returns AUR suggestions for a valid query', async () => {
    const res = await e2e.inject({ method: 'GET', url: '/aur/suggestions?q=par' });

    expect(res.statusCode).toBe(200);
    expect(await res.json()).toEqual(['paru', 'paru-git']);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://aur.archlinux.org/rpc/v5/suggest/par',
      expect.objectContaining({ headers: { accept: 'application/json' } }),
    );
  });

  it('rejects a missing query (400)', async () => {
    const res = await e2e.inject({ method: 'GET', url: '/aur/suggestions' });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a too-short query (400)', async () => {
    const res = await e2e.inject({ method: 'GET', url: '/aur/suggestions?q=p' });
    expect(res.statusCode).toBe(400);
  });
});
