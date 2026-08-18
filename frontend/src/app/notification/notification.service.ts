import { HttpClient } from '@angular/common/http';
import { inject, Service, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwPush } from '@angular/service-worker';
import { lastValueFrom } from 'rxjs';
import { APP_CONFIG } from '../../environments/app-config.token';

const NOTIFICATIONS_SUBSCRIBED_KEY = 'notifications-subscribed';

@Service()
export class NotificationService {
  private readonly appConfig = inject(APP_CONFIG);
  private readonly swPush = inject(SwPush);
  private readonly http = inject(HttpClient);

  readonly notificationsEnabled = signal(false);

  constructor() {
    const stored = localStorage.getItem(NOTIFICATIONS_SUBSCRIBED_KEY) === 'true';
    this.notificationsEnabled.set(Notification.permission === 'granted' && stored);

    this.swPush.notificationClicks.pipe(takeUntilDestroyed()).subscribe(({ notification }) => {
      if (notification.data?.url) window.open(notification.data.url);
    });
  }

  async promptIfNeeded(): Promise<void> {
    if (this.notificationsEnabled()) return;
    const granted = await Notification.requestPermission();
    if (granted !== 'granted') return;
    await this.subscribe();
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
