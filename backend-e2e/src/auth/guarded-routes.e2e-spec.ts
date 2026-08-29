import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createE2eApp, type E2eApp, type E2eMethod } from '../test/e2e-app';

/** Every route behind the real better-auth AuthGuard. Guards run before body
 * validation, so no payloads are needed to exercise them. */
const GUARDED_ROUTES: { method: E2eMethod; url: string }[] = [
  { method: 'POST', url: '/api/queue/schedule' },
  { method: 'POST', url: '/api/queue/promote' },
  { method: 'GET', url: '/repo/run' },
  { method: 'GET', url: '/repo/signal-scan' },
  { method: 'GET', url: '/repo/broken' },
  { method: 'POST', url: '/repo/broken/bump' },
  { method: 'POST', url: '/repo/index/arch' },
  { method: 'POST', url: '/repo/index/chaotic' },
  { method: 'GET', url: '/repo/dependencies' },
  { method: 'GET', url: '/repo/dependencies/firefox' },
  { method: 'GET', url: '/repo/update-db' },
  { method: 'POST', url: '/gitlab/mr-scan' },
  { method: 'GET', url: '/gitlab/schedules' },
  { method: 'POST', url: '/gitlab/approve' },
  { method: 'POST', url: '/gitlab/flag' },
  { method: 'POST', url: '/gitlab/bump-packages' },
  { method: 'POST', url: '/gitlab/add-packages' },
  { method: 'POST', url: '/gitlab/drop-packages' },
  { method: 'POST', url: '/gitlab/run-schedule' },
  { method: 'POST', url: '/gitlab/trigger' },
  { method: 'GET', url: '/aur/suggestions?q=abc' },
  { method: 'POST', url: '/notifications/subscribe' },
  { method: 'GET', url: '/notifications/subscriptions/me' },
  { method: 'GET', url: '/notifications/preferences' },
  { method: 'PUT', url: '/notifications/preferences' },
  { method: 'POST', url: '/admin/rescan-build-classes' },
  { method: 'POST', url: '/admin/recompute-signal-derivations' },
  { method: 'GET', url: '/admin/packages' },
  { method: 'PATCH', url: '/admin/packages/1' },
  { method: 'DELETE', url: '/admin/packages/1' },
  { method: 'GET', url: '/admin/arch-packages' },
  { method: 'PATCH', url: '/admin/arch-packages/1' },
  { method: 'DELETE', url: '/admin/arch-packages/1' },
  { method: 'GET', url: '/admin/repos' },
  { method: 'POST', url: '/admin/repos' },
  { method: 'PATCH', url: '/admin/repos/1' },
  { method: 'DELETE', url: '/admin/repos/1' },
  { method: 'GET', url: '/admin/builders' },
  { method: 'POST', url: '/admin/builders' },
  { method: 'PATCH', url: '/admin/builders/1' },
  { method: 'DELETE', url: '/admin/builders/1' },
  { method: 'GET', url: '/admin/mr-actions' },
  { method: 'GET', url: '/admin/pipeline-triggers' },
  { method: 'GET', url: '/admin/package-bumps' },
  { method: 'GET', url: '/admin/package-elf-analysis' },
  { method: 'GET', url: '/admin/package-elf-analysis/1/bumps' },
  { method: 'PATCH', url: '/admin/package-elf-analysis/1' },
  { method: 'DELETE', url: '/admin/package-elf-analysis/1' },
  { method: 'POST', url: '/admin/rescan' },
  { method: 'GET', url: '/admin/rescan/1' },
];

describe('Guarded routes (e2e, real AuthGuard + PostgreSQL)', () => {
  let e2e: E2eApp;

  beforeAll(async () => {
    e2e = await createE2eApp({ realAuth: true });
  });

  afterAll(async () => {
    await e2e?.close();
  });

  it.each(GUARDED_ROUTES)('denies $method $url without a session cookie (401)', async ({ method, url }) => {
    const res = await e2e.inject({ method, url });

    expect(res.statusCode).toBe(401);
  });

  it.each(GUARDED_ROUTES)('denies $method $url with an unknown session token (401)', async ({ method, url }) => {
    const res = await e2e.inject({
      method,
      url,
      headers: { cookie: 'better-auth.session_token=not-a-real-token' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('lets an org member read admin packages', async () => {
    const user = await e2e.seedAuthUser({ groups: ['chaotic-aur'] });
    const res = await e2e.inject({
      method: 'GET',
      url: '/admin/packages',
      headers: { cookie: user.cookie },
    });

    expect(res.statusCode).toBe(200);
    expect(await res.json()).toEqual({ items: [], total: 0, page: 1, perPage: 25, totalPages: 0 });
  });

  it('lets an org member read broken packages', async () => {
    const user = await e2e.seedAuthUser({ groups: ['chaotic-aur'] });
    const res = await e2e.inject({
      method: 'GET',
      url: '/repo/broken',
      headers: { cookie: user.cookie },
    });

    expect(res.statusCode).toBe(200);
  });
});
