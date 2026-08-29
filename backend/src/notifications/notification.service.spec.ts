import { type NotificationPayload } from '@chaotic-next/shared-lib';
import { BadRequestException } from '@nestjs/common';
import { type PinoLogger } from 'nestjs-pino';
import { rm } from 'node:fs/promises';
import { Repository } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PushSubscription, sendNotification, setVapidDetails } from 'web-push';
import { NotificationPreference } from './notification-preference.entity';
import { NotificationSubscription } from './notification-subscription.entity';
import { NotificationService } from './notification.service';

vi.mock('web-push', () => ({
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn().mockResolvedValue(true),
}));

const LEGACY_FILE = 'config/notification-subscriber.json';
const DB_KEY = 'test-db-key';
const USER_ID = 'user-1';

const validSubscription: PushSubscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/test-device-token',
  keys: {
    p256dh: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkRxZ8wCZHh2e8-pq4N9-O6IGvGgH1fW2e8XvPmT0Q',
    auth: 'fE1rt2Gz7bQ8Jm7OxJm7Vg',
  },
};

function mockRepository() {
  return {
    findOne: vi.fn().mockResolvedValue(undefined),
    find: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    upsert: vi.fn().mockResolvedValue(true),
    delete: vi.fn().mockResolvedValue(true),
  } as unknown as Repository<NotificationSubscription>;
}

function mockPreferenceRepository() {
  return {
    find: vi.fn().mockResolvedValue([]),
    upsert: vi.fn().mockResolvedValue(true),
  } as unknown as Repository<NotificationPreference>;
}

function mockConfigService() {
  return {
    getOrThrow: vi.fn((key: string) => {
      const values: Record<string, string> = {
        CAUR_VAPID_PUBLIC: 'public-key',
        CAUR_VAPID_PRIVATE: 'private-key',
        CAUR_DB_KEY: DB_KEY,
      };
      return values[key] ?? '';
    }),
  };
}

describe('NotificationService', () => {
  let repo: Repository<NotificationSubscription>;
  let preferenceRepo: Repository<NotificationPreference>;
  let service: NotificationService;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = mockRepository();
    preferenceRepo = mockPreferenceRepository();
    service = new NotificationService(
      {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
        debug: () => undefined,
      } as unknown as PinoLogger,
      repo,
      preferenceRepo,
      mockConfigService() as never,
    );
  });

  afterEach(async () => {
    await rm(LEGACY_FILE, { force: true });
  });

  describe('constructor', () => {
    it('configures VAPID details on startup', () => {
      expect(setVapidDetails).toHaveBeenCalledWith('mailto:root@chaotic.cx', 'public-key', 'private-key');
    });
  });

  describe('subscribeToPushEvents', () => {
    it('stores a valid subscription with its user and sends a welcome notification', async () => {
      const result = await service.subscribeToPushEvents(validSubscription, USER_ID);

      expect(repo.findOne).toHaveBeenCalledWith({ where: { endpoint: validSubscription.endpoint } });
      expect(repo.count).toHaveBeenCalled();
      expect(repo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_ID,
          endpoint: validSubscription.endpoint,
          p256dh: validSubscription.keys.p256dh,
          auth: validSubscription.keys.auth,
          expirationTime: null,
        }),
        ['endpoint'],
      );
      expect(result).toEqual({ message: 'Subscription successful' });
      expect(sendNotification).toHaveBeenCalledWith(
        validSubscription,
        expect.stringContaining('Subscription successful'),
      );
    });

    it('reuses an existing subscription without counting against the limit', async () => {
      vi.mocked(repo.findOne).mockResolvedValue({
        id: 1,
        endpoint: validSubscription.endpoint,
      } as NotificationSubscription);
      await service.subscribeToPushEvents(validSubscription, USER_ID);
      expect(repo.count).not.toHaveBeenCalled();
      expect(repo.upsert).toHaveBeenCalled();
    });

    it('keeps the subscription when the welcome push fails transiently', async () => {
      vi.mocked(sendNotification).mockRejectedValueOnce(new Error('network error'));
      await expect(service.subscribeToPushEvents(validSubscription, USER_ID)).resolves.toEqual({
        message: 'Subscription successful',
      });
      expect(repo.upsert).toHaveBeenCalled();
      expect(repo.delete).not.toHaveBeenCalled();
    });

    it('removes a stale subscription when the push service returns 410', async () => {
      vi.mocked(sendNotification).mockRejectedValueOnce({ statusCode: 410 });
      await expect(service.subscribeToPushEvents(validSubscription, USER_ID)).resolves.toEqual({
        message: 'Subscription successful',
      });
      expect(repo.delete).toHaveBeenCalledWith({ endpoint: validSubscription.endpoint });
    });

    it('rejects an endpoint on a non-allowlisted host', async () => {
      const malicious = { ...validSubscription, endpoint: 'https://evil.example.com/push' };
      await expect(service.subscribeToPushEvents(malicious, USER_ID)).rejects.toThrow(BadRequestException);
      expect(repo.upsert).not.toHaveBeenCalled();
    });

    it('rejects a non-https endpoint', async () => {
      const http = { ...validSubscription, endpoint: 'http://fcm.googleapis.com/fcm/send/x' };
      await expect(service.subscribeToPushEvents(http, USER_ID)).rejects.toThrow(BadRequestException);
    });

    it('rejects when the subscriber limit is reached', async () => {
      vi.mocked(repo.count).mockResolvedValue(1000);
      await expect(service.subscribeToPushEvents(validSubscription, USER_ID)).rejects.toThrow('Too many subscribers');
      expect(repo.upsert).not.toHaveBeenCalled();
    });
  });

  describe('getSubscriptions', () => {
    it('returns all stored subscriptions', async () => {
      const rows = [{ id: 1, endpoint: validSubscription.endpoint } as NotificationSubscription];
      vi.mocked(repo.find).mockResolvedValue(rows);
      await expect(service.getSubscriptions()).resolves.toEqual(rows);
    });
  });

  describe('getPreferences', () => {
    it('defaults every type to enabled when no rows exist', async () => {
      await expect(service.getPreferences(USER_ID)).resolves.toEqual([
        { type: 'build-failure', enabled: true },
        { type: 'mr-review', enabled: true },
      ]);
    });

    it('applies stored rows and keeps defaults for the rest', async () => {
      vi.mocked(preferenceRepo.find).mockResolvedValue([
        { userId: USER_ID, type: 'build-failure', enabled: false } as NotificationPreference,
      ]);
      await expect(service.getPreferences(USER_ID)).resolves.toEqual([
        { type: 'build-failure', enabled: false },
        { type: 'mr-review', enabled: true },
      ]);
      expect(preferenceRepo.find).toHaveBeenCalledWith({ where: { userId: USER_ID } });
    });
  });

  describe('setPreferences', () => {
    it('upserts every preference for the user', async () => {
      const prefs = [
        { type: 'build-failure' as const, enabled: false },
        { type: 'mr-review' as const, enabled: true },
      ];

      await service.setPreferences(USER_ID, prefs);

      expect(preferenceRepo.upsert).toHaveBeenCalledWith(
        [
          { userId: USER_ID, type: 'build-failure', enabled: false },
          { userId: USER_ID, type: 'mr-review', enabled: true },
        ],
        ['userId', 'type'],
      );
    });
  });

  describe('broadcast', () => {
    const notification: NotificationPayload = {
      notification: {
        title: 'Build failed: spotdl',
        icon: '/android-chrome-512x512.png',
        body: 'Missing dependency',
        data: { onActionClick: { default: { operation: 'navigateLastFocusedOrOpen', url: 'https://chaotic.cx' } } },
      },
    };

    it('does nothing when there are no subscribers', async () => {
      await expect(service.broadcast(notification, 'build-failure')).resolves.toBe(0);
      expect(sendNotification).not.toHaveBeenCalled();
    });

    it('sends the notification to every subscriber without opt-outs', async () => {
      vi.mocked(repo.find).mockResolvedValue([{ id: 1, userId: USER_ID, endpoint: '#1' } as NotificationSubscription]);
      vi.mocked(sendNotification).mockResolvedValue({ statusCode: 200, body: '', headers: {} });

      await expect(service.broadcast(notification, 'build-failure')).resolves.toBe(1);
      expect(sendNotification).toHaveBeenCalledTimes(1);
      expect(sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({ endpoint: '#1' }),
        JSON.stringify(notification),
      );
    });

    it('skips users who disabled the notification type', async () => {
      vi.mocked(repo.find).mockResolvedValue([
        { id: 1, userId: 'opted-out', endpoint: '#off' } as NotificationSubscription,
        { id: 2, userId: 'subscribed', endpoint: '#on' } as NotificationSubscription,
      ]);
      vi.mocked(preferenceRepo.find).mockResolvedValue([
        { userId: 'opted-out', type: 'build-failure', enabled: false } as NotificationPreference,
      ]);
      vi.mocked(sendNotification).mockResolvedValue({ statusCode: 200, body: '', headers: {} });

      await expect(service.broadcast(notification, 'build-failure')).resolves.toBe(1);
      expect(sendNotification).toHaveBeenCalledTimes(1);
      expect(sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({ endpoint: '#on' }),
        JSON.stringify(notification),
      );
    });

    it('removes stale subscriptions rejected with 410', async () => {
      vi.mocked(repo.find).mockResolvedValue([
        { id: 1, userId: 'a', endpoint: '#stale' } as NotificationSubscription,
        { id: 2, userId: 'b', endpoint: '#live' } as NotificationSubscription,
      ]);
      vi.mocked(sendNotification)
        .mockRejectedValueOnce({ statusCode: 410 })
        .mockResolvedValueOnce({ statusCode: 200, body: '', headers: {} });

      await expect(service.broadcast(notification, 'build-failure')).resolves.toBe(2);
      expect(repo.delete).toHaveBeenCalledWith({ endpoint: '#stale' });
    });
  });
});
