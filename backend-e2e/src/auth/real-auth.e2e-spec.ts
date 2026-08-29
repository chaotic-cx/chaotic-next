import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createE2eApp, type E2eApp } from '../test/e2e-app';

describe('Notifications routes (e2e, real AuthGuard + PostgreSQL)', () => {
  let e2e: E2eApp;

  beforeAll(async () => {
    e2e = await createE2eApp({ realAuth: true });
  });

  afterAll(async () => {
    await e2e?.close();
  });

  it('rejects a request without a session cookie (401)', async () => {
    const res = await e2e.inject({ method: 'GET', url: '/notifications/preferences' });

    expect(res.statusCode).toBe(401);
  });

  it('rejects a request with an unknown session token (401)', async () => {
    const res = await e2e.inject({
      method: 'GET',
      url: '/notifications/preferences',
      headers: { cookie: 'better-auth.session_token=not-a-real-token' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('lets an org member subscribe and stores their real user id', async () => {
    const user = await e2e.seedAuthUser({ groups: ['chaotic-aur'] });
    const endpoint = 'https://fcm.googleapis.com/fcm/send/real-auth-org-user';
    const res = await e2e.inject({
      method: 'POST',
      url: '/notifications/subscribe',
      payload: {
        endpoint,
        keys: {
          p256dh: 'BPxvOBCGQeLsXnXrQhWhSCwQmZbFvqOmJNotKBbQqJBgqkbZyXvNqf0QqNbQqQqQqQq',
          auth: 'dGhpcy1pcy1hLXRlc3Q',
        },
        expirationTime: null,
      },
      headers: { cookie: user.cookie },
    });

    expect(res.statusCode).toBe(201);

    const row = await e2e.dataSource.query(`SELECT "userId" FROM "notification_subscription" WHERE "endpoint" = $1`, [
      endpoint,
    ]);
    expect(row[0]?.userId).toBe(user.userId);
  });

  it('lets a regular user without org membership use their own preferences', async () => {
    const user = await e2e.seedAuthUser({ groups: [] });
    const res = await e2e.inject<unknown>({
      method: 'GET',
      url: '/notifications/preferences',
      headers: { cookie: user.cookie },
    });

    expect(res.statusCode).toBe(200);
    expect(await res.json()).toEqual([
      { type: 'build-failure', enabled: true },
      { type: 'mr-review', enabled: true },
    ]);
  });

  it('keeps preferences of two users separate', async () => {
    const orgUser = await e2e.seedAuthUser({ groups: ['chaotic-aur'] });
    const regularUser = await e2e.seedAuthUser({ groups: [] });

    const put = await e2e.inject({
      method: 'PUT',
      url: '/notifications/preferences',
      payload: [{ type: 'build-failure', enabled: false }],
      headers: { cookie: orgUser.cookie },
    });
    expect(put.statusCode).toBe(200);

    const orgRes = await e2e.inject<unknown>({
      method: 'GET',
      url: '/notifications/preferences',
      headers: { cookie: orgUser.cookie },
    });
    const regularRes = await e2e.inject<unknown>({
      method: 'GET',
      url: '/notifications/preferences',
      headers: { cookie: regularUser.cookie },
    });
    expect(await orgRes.json()).toEqual([
      { type: 'build-failure', enabled: false },
      { type: 'mr-review', enabled: true },
    ]);
    expect(await regularRes.json()).toEqual([
      { type: 'build-failure', enabled: true },
      { type: 'mr-review', enabled: true },
    ]);
  });
});
