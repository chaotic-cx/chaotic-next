import {
  NOTIFICATION_TYPES,
  NotificationPayload,
  type NotificationPreferenceDto,
  type NotificationType,
  type PushSubscriptionBodyDto,
} from '@chaotic-next/shared-lib';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Repository } from 'typeorm';
import { type PushSubscription, sendNotification, setVapidDetails } from 'web-push';
import { NotificationPreference } from './notification-preference.entity';
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
export class NotificationService {
  private readonly legacySubscribersFilePath = 'config/notification-subscriber.json';

  constructor(
    @InjectPinoLogger(NotificationService.name) private readonly pino: PinoLogger,
    @InjectRepository(NotificationSubscription)
    private readonly subscriptionRepository: Repository<NotificationSubscription>,
    @InjectRepository(NotificationPreference)
    private readonly preferenceRepository: Repository<NotificationPreference>,
    private readonly configService: ConfigService,
  ) {
    setVapidDetails(
      'mailto:root@chaotic.cx',
      this.configService.getOrThrow<string>('CAUR_VAPID_PUBLIC'),
      this.configService.getOrThrow<string>('CAUR_VAPID_PRIVATE'),
    );
  }

  /**
   * Subscribe to push events by saving the subscription details.
   * @param body Push subscription details
   * @returns Success message
   */
  async subscribeToPushEvents(body: PushSubscriptionBodyDto, userId: string): Promise<{ message: string }> {
    if (!isAllowedPushEndpoint(body)) {
      throw new BadRequestException('Push endpoint is not an allowed HTTPS push service', {
        errorCode: 'INVALID_SUBSCRIPTION',
      });
    }

    const existing = await this.subscriptionRepository.findOne({ where: { endpoint: body.endpoint } });
    if (!existing && (await this.subscriptionRepository.count()) >= MAX_SUBSCRIBERS) {
      throw new BadRequestException('Too many subscribers', { errorCode: 'TOO_MANY_SUBSCRIBERS' });
    }
    await this.upsertSubscription(body, userId);

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

  private async upsertSubscription(sub: PushSubscriptionBodyDto, userId: string): Promise<void> {
    await this.subscriptionRepository.upsert(
      {
        userId,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        expirationTime: sub.expirationTime ? new Date(sub.expirationTime) : null,
      },
      ['endpoint'],
    );
  }

  /**
   * Returns the push preferences of a user. Types without a stored row default
   * to enabled, so the empty table means "everything on".
   */
  async getPreferences(userId: string): Promise<NotificationPreferenceDto[]> {
    const rows = await this.preferenceRepository.find({ where: { userId } });
    const enabledByType = new Map(rows.map((row) => [row.type, row.enabled]));
    return NOTIFICATION_TYPES.map((type) => ({ type, enabled: enabledByType.get(type) ?? true }));
  }

  async setPreferences(userId: string, preferences: NotificationPreferenceDto[]): Promise<void> {
    await this.preferenceRepository.upsert(
      preferences.map((pref) => ({ userId, type: pref.type, enabled: pref.enabled })),
      ['userId', 'type'],
    );
  }

  /**
   * Sends a notification of the given type to every subscription whose user
   * has not disabled that type.
   * @returns Number of subscriptions the notification was attempted for
   */
  async broadcast(notification: NotificationPayload, type: NotificationType): Promise<number> {
    const [subscriptions, optedOut] = await Promise.all([
      this.subscriptionRepository.find(),
      this.preferenceRepository.find({ where: { type, enabled: false } }),
    ]);
    const optedOutUserIds = new Set(optedOut.map((pref) => pref.userId));
    const targets = subscriptions.filter((sub) => !optedOutUserIds.has(sub.userId));
    if (targets.length === 0) return 0;

    const promises = targets.map((sub) => {
      const pushSubscription: PushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };
      return sendNotification(pushSubscription, JSON.stringify(notification));
    });

    const results = await Promise.allSettled(promises);
    let failed = 0;
    let stale = 0;
    for (let index = 0; index < results.length; index += 1) {
      const result = results[index];
      if (result.status === 'fulfilled') continue;
      const statusCode = (result.reason as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await this.subscriptionRepository.delete({ endpoint: targets[index].endpoint });
        stale += 1;
      } else {
        failed += 1;
        this.pino.warn({ err: result.reason }, 'Push notification broadcast failed');
      }
    }

    this.pino.info(
      { delivered: results.length - failed - stale, total: results.length, stale, type },
      'Push notification broadcast complete',
    );
    return results.length;
  }
}
