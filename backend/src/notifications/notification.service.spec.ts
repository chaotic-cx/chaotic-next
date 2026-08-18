import { BadRequestException } from '@nestjs/common';
import { encryptAesRaw } from '../utils/functions';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
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
    service = new NotificationService(repo, mockConfigService() as never);
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

    it('rejects an endpoint on a non-allowlisted host', async () => {
      const malicious = { ...validSubscription, endpoint: 'https://evil.example.com/push' };
      await expect(service.subscribeToPushEvents(malicious)).rejects.toThrow(BadRequestException);
      expect(repo.upsert).not.toHaveBeenCalled();
    });

    it('rejects a non-https endpoint', async () => {
      const http = { ...validSubscription, endpoint: 'http://fcm.googleapis.com/fcm/send/x' };
      await expect(service.subscribeToPushEvents(http)).rejects.toThrow(BadRequestException);
    });

    it('rejects an endpoint with missing keys', async () => {
      const noKeys = { endpoint: validSubscription.endpoint } as PushSubscription;
      await expect(service.subscribeToPushEvents(noKeys)).rejects.toThrow(BadRequestException);
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

  describe('legacy file import', () => {
    it('imports encrypted subscribers from the legacy file and deletes it', async () => {
      const legacy = [
        validSubscription,
        { ...validSubscription, endpoint: 'https://push.services.mozilla.com/wpush/v2/test' },
      ];
      await mkdir(dirname(LEGACY_FILE), { recursive: true });
      await writeFile(LEGACY_FILE, encryptAesRaw(JSON.stringify(legacy), DB_KEY));

      await service.onModuleInit();

      expect(repo.upsert).toHaveBeenCalledTimes(2);
      expect(repo.upsert).toHaveBeenCalledWith(expect.objectContaining({ endpoint: legacy[0].endpoint }), ['endpoint']);
      await expect(readFile(LEGACY_FILE, 'utf-8')).rejects.toThrow();
    });

    it('skips invalid entries during import', async () => {
      const legacy = [validSubscription, { endpoint: 'not-a-valid-push-endpoint', keys: {} }];
      await mkdir(dirname(LEGACY_FILE), { recursive: true });
      await writeFile(LEGACY_FILE, encryptAesRaw(JSON.stringify(legacy), DB_KEY));

      await service.onModuleInit();

      expect(repo.upsert).toHaveBeenCalledTimes(1);
    });

    it('does nothing when the legacy file is absent', async () => {
      await service.onModuleInit();
      expect(repo.upsert).not.toHaveBeenCalled();
    });
  });
});
