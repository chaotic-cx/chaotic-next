import { decryptAesRaw } from '../utils/functions';
import { NotificationSubscription } from './notification-subscription.entity';
import {
  NotificationPayload,
  pushSubscriptionBodySchema,
  type PushSubscriptionBodyDto,
} from '@chaotic-next/shared-lib';
import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { existsSync } from 'node:fs';
import { readFile, unlink } from 'node:fs/promises';
import { Repository } from 'typeorm';
import { sendNotification, setVapidDetails } from 'web-push';

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

/** The endpoint is zod-validated for shape; this blocks non-HTTPS / non-allowlist hosts (SSRF). */
function isAllowedPushEndpoint(sub: { endpoint: string }): boolean {
  let url: URL;
  try {
    url = new URL(sub.endpoint);
  } catch {
    return false;
  }
  return url.protocol === 'https:' && isAllowedPushHost(url.hostname);
}

@Injectable()
export class NotificationService implements OnModuleInit {
  private readonly legacySubscribersFilePath = 'config/notification-subscriber.json';

  constructor(
    @InjectPinoLogger(NotificationService.name) private readonly pino: PinoLogger,
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
  async subscribeToPushEvents(body: PushSubscriptionBodyDto): Promise<{ message: string }> {
    if (!isAllowedPushEndpoint(body)) {
      throw new BadRequestException('Push endpoint is not an allowed HTTPS push service', {
        errorCode: 'INVALID_SUBSCRIPTION',
      });
    }

    const existing = await this.subscriptionRepository.findOne({ where: { endpoint: body.endpoint } });
    if (!existing && (await this.subscriptionRepository.count()) >= MAX_SUBSCRIBERS) {
      throw new BadRequestException('Too many subscribers', { errorCode: 'TOO_MANY_SUBSCRIBERS' });
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
      await sendNotification({ endpoint: body.endpoint, keys: body.keys }, JSON.stringify(notification));
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await this.subscriptionRepository.delete({ endpoint: body.endpoint });
        this.pino.warn({ statusCode, endpoint: body.endpoint }, 'Removed stale push subscription');
      } else {
        this.pino.warn({ err: error }, 'Welcome push notification failed');
      }
    }

    return { message: 'Subscription successful' };
  }

  async getSubscriptions(): Promise<NotificationSubscription[]> {
    return this.subscriptionRepository.find();
  }

  private async upsertSubscription(sub: PushSubscriptionBodyDto): Promise<void> {
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
        const subscription = pushSubscriptionBodySchema.safeParse(entry);
        if (!subscription.success) continue;
        await this.upsertSubscription(subscription.data);
        imported += 1;
      }
      await unlink(this.legacySubscribersFilePath);
      this.pino.info({ count: imported }, 'Imported push subscribers from legacy file');
    } catch (err) {
      this.pino.error({ err }, 'Failed to import legacy push subscribers');
    }
  }
}
