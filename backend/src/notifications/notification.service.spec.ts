import { type NotificationPayload } from '@chaotic-next/shared-lib';
import { BadRequestException } from '@nestjs/common';
import { type PinoLogger } from 'nestjs-pino';
import { rm } from 'node:fs/promises';
import { Repository } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PushSubscription, sendNotification, setVapidDetails } from 'web-push';
import { NotificationSubscription } from './notification-subscription.entity';
import { NotificationService } from './notification.service';

vi.mock('web-push', () => ({
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn().mockResolvedValue(true),
}));

const LEGACY_FILE = 'config/notification-subscriber.json';
const DB_KEY = 'test-db-key';

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
  let service: NotificationService;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = mockRepository();
    service = new NotificationService(
      {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
        debug: () => undefined,
      } as unknown as PinoLogger,
      repo,
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
    it('stores a valid subscription and sends a welcome notification', async () => {
      const result = await service.subscribeToPushEvents(validSubscription);

      expect(repo.findOne).toHaveBeenCalledWith({ where: { endpoint: validSubscription.endpoint } });
      expect(repo.count).toHaveBeenCalled();
      expect(repo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
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
      await service.subscribeToPushEvents(validSubscription);
      expect(repo.count).not.toHaveBeenCalled();
      expect(repo.upsert).toHaveBeenCalled();
    });

    it('keeps the subscription when the welcome push fails transiently', async () => {
      vi.mocked(sendNotification).mockRejectedValueOnce(new Error('network error'));
      await expect(service.subscribeToPushEvents(validSubscription)).resolves.toEqual({
        message: 'Subscription successful',
      });
      expect(repo.upsert).toHaveBeenCalled();
      expect(repo.delete).not.toHaveBeenCalled();
    });

    it('removes a stale subscription when the push service returns 410', async () => {
      vi.mocked(sendNotification).mockRejectedValueOnce({ statusCode: 410 });
      await expect(service.subscribeToPushEvents(validSubscription)).resolves.toEqual({
        message: 'Subscription successful',
      });
      expect(repo.delete).toHaveBeenCalledWith({ endpoint: validSubscription.endpoint });
    });

    it('rejects an endpoint on a non-allowlisted host', async () => {
      const malicious = { ...validSubscription, endpoint: 'https://evil.example.com/push' };
      await expect(service.subscribeToPushEvents(malicious)).rejects.toThrow(BadRequestException);
      expect(repo.upsert).not.toHaveBeenCalled();
    });

    it('rejects a non-https endpoint', async () => {
      const http = { ...validSubscription, endpoint: 'http://fcm.googleapis.com/fcm/send/x' };
      await expect(service.subscribeToPushEvents(http)).rejects.toThrow(BadRequestException);
    });

    it('rejects when the subscriber limit is reached', async () => {
      vi.mocked(repo.count).mockResolvedValue(1000);
      await expect(service.subscribeToPushEvents(validSubscription)).rejects.toThrow('Too many subscribers');
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
      await expect(service.broadcast(notification)).resolves.toBe(0);
      expect(sendNotification).not.toHaveBeenCalled();
    });

    it('sends the notification to every subscriber', async () => {
      vi.mocked(repo.find).mockResolvedValue([{ id: 1, endpoint: '#1' } as NotificationSubscription]);
      vi.mocked(sendNotification).mockResolvedValue({ statusCode: 200, body: '', headers: {} });

      await expect(service.broadcast(notification)).resolves.toBe(1);
      expect(sendNotification).toHaveBeenCalledTimes(1);
      expect(sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({ endpoint: '#1' }),
        JSON.stringify(notification),
      );
    });

    it('removes stale subscriptions rejected with 410', async () => {
      vi.mocked(repo.find).mockResolvedValue([
        { id: 1, endpoint: '#stale' } as NotificationSubscription,
        { id: 2, endpoint: '#live' } as NotificationSubscription,
      ]);
      vi.mocked(sendNotification)
        .mockRejectedValueOnce({ statusCode: 410 })
        .mockResolvedValueOnce({ statusCode: 200, body: '', headers: {} });

      await expect(service.broadcast(notification)).resolves.toBe(2);
      expect(repo.delete).toHaveBeenCalledWith({ endpoint: '#stale' });
    });
  });
});
