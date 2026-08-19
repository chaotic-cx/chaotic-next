import { NotificationPayload } from '@chaotic-next/shared-lib';
import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { existsSync } from 'node:fs';
import { readFile, unlink } from 'node:fs/promises';
import { Repository } from 'typeorm';
import { PushSubscription, sendNotification, setVapidDetails } from 'web-push';
import { decryptAesRaw, errorMessage } from '../utils/functions';
import { NotificationSubscription } from './notification-subscription.entity';

const MAX_SUBSCRIBERS = 1000;

/** Push endpoints web-push may deliver to. Everything else is rejected to prevent SSRF. */
const ALLOWED_PUSH_HOSTS = [
  'fcm.googleapis.com',
  'push.services.mozilla.com',
  'updates.push.services.mozilla.com',
  'wns2-par02p.notify.windows.com',
];

function isAllowedPushHost(hostname: string): boolean {
  return ALLOWED_PUSH_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
}

function isValidPushSubscription(sub: unknown): sub is PushSubscription {
  if (typeof sub !== 'object' || sub === null) return false;
  const { endpoint, keys } = sub as { endpoint?: unknown; keys?: unknown };
  if (typeof endpoint !== 'string' || endpoint.length === 0 || endpoint.length > 500) return false;

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (!isAllowedPushHost(url.hostname)) return false;

  if (typeof keys !== 'object' || keys === null) return false;
  const { p256dh, auth } = keys as { p256dh?: unknown; auth?: unknown };
  return typeof p256dh === 'string' && p256dh.length > 0 && typeof auth === 'string' && auth.length > 0;
}

@Injectable()
export class NotificationService implements OnModuleInit {
  private readonly logger = new Logger(NotificationService.name);
  private readonly legacySubscribersFilePath = 'config/notification-subscriber.json';

  constructor(
    @InjectRepository(NotificationSubscription)
    private readonly subscriptionRepository: Repository<NotificationSubscription>,
    private readonly configService: ConfigService,
  ) {
    setVapidDetails(
      'mailto:root@chaotic.cx',
      this.configService.getOrThrow<string>('CAUR_VAPID_PUBLIC'),
      this.configService.getOrThrow<string>('CAUR_VAPID_PRIVATE'),
    );
  }

  async onModuleInit(): Promise<void> {
    await this.importSubscribersFromLegacyFile();
  }

  /**
   * Subscribe to push events by saving the subscription details.
   * @param body Push subscription details
   * @returns Success message
   */
  async subscribeToPushEvents(body: PushSubscription): Promise<{ message: string }> {
    if (!isValidPushSubscription(body)) {
      throw new BadRequestException('Invalid push subscription');
    }

    const existing = await this.subscriptionRepository.findOne({ where: { endpoint: body.endpoint } });
    if (!existing && (await this.subscriptionRepository.count()) >= MAX_SUBSCRIBERS) {
      throw new BadRequestException('Too many subscribers');
    }
    await this.upsertSubscription(body);

    const notification: NotificationPayload = {
      notification: {
        title: 'Subscription successful',
        body: 'You have successfully subscribed to Chaotic AUR notifications.',
        icon: '/android-chrome-512x512.png',
        data: {
          onActionClick: {
            default: {
              operation: 'openWindow',
              url: 'https://chaotic.cx',
            },
          },
        },
      },
    };

    try {
      await sendNotification(body, JSON.stringify(notification));
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await this.subscriptionRepository.delete({ endpoint: body.endpoint });
        this.logger.warn(`Removed stale push subscription (${statusCode}): ${body.endpoint}`);
      } else {
        this.logger.warn(`Welcome push notification failed: ${errorMessage(error)}`);
      }
    }

    return { message: 'Subscription successful' };
  }

  async getSubscriptions(): Promise<NotificationSubscription[]> {
    return this.subscriptionRepository.find();
  }

  private async upsertSubscription(sub: PushSubscription): Promise<void> {
    await this.subscriptionRepository.upsert(
      {
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        expirationTime: sub.expirationTime ? new Date(sub.expirationTime) : null,
      },
      ['endpoint'],
    );
  }

  private async importSubscribersFromLegacyFile(): Promise<void> {
    if (!existsSync(this.legacySubscribersFilePath)) return;

    try {
      const encrypted = await readFile(this.legacySubscribersFilePath, 'utf-8');
      const decrypted = decryptAesRaw(encrypted, this.configService.getOrThrow<string>('CAUR_DB_KEY'));
      const parsed = JSON.parse(decrypted) as unknown[];
      let imported = 0;
      for (const entry of parsed) {
        if (!isValidPushSubscription(entry)) continue;
        await this.upsertSubscription(entry);
        imported += 1;
      }
      await unlink(this.legacySubscribersFilePath);
      this.logger.log(`Imported ${imported} push subscribers from legacy file`);
    } catch (err) {
      this.logger.error(`Failed to import legacy push subscribers: ${errorMessage(err)}`);
    }
  }
}
