import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('web-push', () => ({
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn().mockResolvedValue(undefined),
  generateVAPIDKeys: vi.fn().mockReturnValue({
    publicKey: 'BPWNRtrPfUjhwu8ST1Se2jfU0P_u5YJ0uo3xCovSkNEor1XY4ZX_HVriwh0T1_a3rvoD2oFymAxvNyUe4PthHXQ',
    privateKey: 'epJJES7PtVQ19YkI67dn6Ndf23U-rVr4Gr8mrZQeoqw',
  }),
}));

import { createE2eApp, type E2eApp } from '../test/e2e-app';
import { NotificationSubscription } from '@chaotic-next/backend/notifications/notification-subscription.entity';

function validSubscription(endpoint: string) {
  return {
    endpoint,
    keys: {
      p256dh: 'BPxvOBCGQeLsXnXrQhWhSCwQmZbFvqOmJNotKBbQqJBgqkbZyXvNqf0QqNbQqQqQqQq',
      auth: 'dGhpcy1pcy1hLXRlc3Q',
    },
    expirationTime: null,
  };
}

describe('Notifications endpoint (e2e, real PostgreSQL)', () => {
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

  describe('POST /notifications/subscribe', () => {
    it('creates a subscription and returns 201', async () => {
      const endpoint = 'https://fcm.googleapis.com/fcm/send/test-new-subscriber';
      const res = await e2e.inject<{ message: string }>({
        method: 'POST',
        url: '/notifications/subscribe',
        payload: validSubscription(endpoint),
      });

      expect(res.statusCode).toBe(201);
      expect(await res.json()).toEqual({ message: 'Subscription successful' });

      const repo = e2e.dataSource.getRepository(NotificationSubscription);
      const row = await repo.findOneBy({ endpoint });
      expect(row).not.toBeNull();
      expect(row?.p256dh).toBe(validSubscription(endpoint).keys.p256dh);
    });

    it('rejects a subscription with a non-allowlisted endpoint host (400)', async () => {
      const res = await e2e.inject({
        method: 'POST',
        url: '/notifications/subscribe',
        payload: validSubscription('https://evil.example.com/push/abc'),
      });

      expect(res.statusCode).toBe(400);
    });

    it('upserts (is idempotent) when the same endpoint is re-subscribed', async () => {
      const endpoint = 'https://fcm.googleapis.com/fcm/send/test-duplicate';
      await e2e.seedNotificationSubscription({
        endpoint,
        p256dh: 'old-key',
        auth: 'old-auth',
      });

      const res = await e2e.inject({
        method: 'POST',
        url: '/notifications/subscribe',
        payload: validSubscription(endpoint),
      });

      expect(res.statusCode).toBe(201);

      const repo = e2e.dataSource.getRepository(NotificationSubscription);
      const rows = await repo.find({ where: { endpoint } });
      expect(rows).toHaveLength(1);
      expect(rows[0].p256dh).not.toBe('old-key');
    });

    it('rejects a malformed body missing keys (400)', async () => {
      const res = await e2e.inject({
        method: 'POST',
        url: '/notifications/subscribe',
        payload: { endpoint: 'https://fcm.googleapis.com/fcm/send/test' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('persists expirationTime when provided', async () => {
      const endpoint = 'https://fcm.googleapis.com/fcm/send/test-with-expiry';
      const res = await e2e.inject({
        method: 'POST',
        url: '/notifications/subscribe',
        payload: {
          endpoint,
          keys: {
            p256dh: 'BPxvOBCGQeLsXnXrQhWhSCwQmZbFvqOmJNotKBbQqJBgqkbZyXvNqf0QqNbQqQqQqQq',
            auth: 'dGhpcy1pcy1hLXRlc3Q',
          },
          expirationTime: '2026-12-31T23:59:59.000Z',
        },
      });

      expect(res.statusCode).toBe(201);

      const repo = e2e.dataSource.getRepository(NotificationSubscription);
      const row = await repo.findOneBy({ endpoint });
      expect(row).not.toBeNull();
      expect(row?.expirationTime).toEqual(new Date('2026-12-31T23:59:59.000Z'));
    });
  });
});
