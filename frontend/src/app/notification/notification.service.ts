import { HttpClient } from '@angular/common/http';
import { inject, Service, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwPush } from '@angular/service-worker';
import { lastValueFrom } from 'rxjs';
import { APP_CONFIG } from '../../environments/app-config.token';

const NOTIFICATIONS_SUBSCRIBED_KEY = 'notifications-subscribed';

export function areNotificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && 'PushManager' in window;
}

@Service()
export class NotificationService {
  private readonly appConfig = inject(APP_CONFIG);
  private readonly swPush = inject(SwPush);
  private readonly http = inject(HttpClient);

  readonly isSupported = areNotificationsSupported();
  readonly notificationsEnabled = signal(false);

  constructor() {
    const stored = localStorage.getItem(NOTIFICATIONS_SUBSCRIBED_KEY) === 'true';
    this.notificationsEnabled.set(this.isSupported && Notification.permission === 'granted' && stored);

    this.swPush.notificationClicks.pipe(takeUntilDestroyed()).subscribe(({ notification }) => {
      if (notification.data?.url) window.open(notification.data.url);
    });
  }

  async requestPermissionAndSubscribe(): Promise<void> {
    if (!this.isSupported || this.notificationsEnabled()) return;
    if (!(await this.requestPermission())) return;
    await this.subscribe();
  }

  private async requestPermission(): Promise<boolean> {
    try {
      if (Notification.permission === 'denied') return false;
      return (await Notification.requestPermission()) === 'granted';
    } catch {
      return false;
    }
  }

  private async subscribe(): Promise<void> {
    try {
      const subscription = await this.swPush.requestSubscription({
        serverPublicKey: this.appConfig.vapidPublicKey,
      });
      const ok = await this.sendSubscriptionToServer(subscription);
      localStorage.setItem(NOTIFICATIONS_SUBSCRIBED_KEY, String(ok));
      this.notificationsEnabled.set(ok);
    } catch {
      this.notificationsEnabled.set(false);
    }
  }

  private async sendSubscriptionToServer(subscription: PushSubscription): Promise<boolean> {
    try {
      await lastValueFrom(
        this.http.post(`${this.appConfig.backendUrl}/notifications/subscribe`, subscription.toJSON()),
      );
      return true;
    } catch {
      return false;
    }
  }
}
