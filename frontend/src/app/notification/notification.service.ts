import { inject, Injectable, signal } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { HttpClient } from '@angular/common/http';
import { APP_CONFIG } from '../../environments/app-config.token';
import { lastValueFrom } from 'rxjs';
import { PushNotification } from '@./shared-lib';

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  notificationsEnabled = signal<boolean>(false);

  private readonly appConfig = inject(APP_CONFIG);
  private readonly swPush = inject(SwPush);
  private readonly http = inject(HttpClient);

  constructor() {
    const storedPreference = localStorage.getItem('notifications-subscribed');
    this.notificationsEnabled.set(Notification.permission === 'granted' && storedPreference === 'true');

    this.swPush.messages.subscribe((message: any) => {
      this.sendNotification(message as PushNotification);
    });

    this.swPush.notificationClicks.subscribe(({ action, notification }) => {
      console.log('Notification clicked', action, notification);
      if (notification.data && notification.data.url) {
        window.open(notification.data.url);
      }
    });
  }

  async requestPermission() {
    if (!('Notification' in window)) {
      console.log('This browser does not support notifications');
      return false;
    }

    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  async subscribeToNotifications() {
    const granted = await this.requestPermission();
    if (!granted) {
      console.log('Notification permission not granted');
      return false;
    }

    try {
      const subscription: PushSubscription = await this.swPush.requestSubscription({
        serverPublicKey: this.appConfig.vapidPublicKey,
      });
      const result = await this.sendSubscriptionToServer(subscription);
      localStorage.setItem('notifications-subscribed', String(result));
      this.notificationsEnabled.set(result);
      return result;
    } catch (error) {
      console.error('Could not subscribe to notifications', error);
      return false;
    }
  }

  async unsubscribeFromNotifications() {
    try {
      await this.swPush.unsubscribe();
    } catch (error) {
      console.error('Error unsubscribing from notifications', error);
    }
  }

  private async sendSubscriptionToServer(subscription: PushSubscription) {
    try {
      const result = await lastValueFrom(
        this.http.post(`${this.appConfig.backendUrl}/auth/subscribe`, subscription.toJSON()),
      );
      console.log('Subscription sent to server', result);
      return true;
    } catch (error) {
      console.error('Error sending subscription to server', error);
      return false;
    }
  }

  sendNotification(message: PushNotification) {
    console.log('Received push notification', message);
    if (this.notificationsEnabled()) {
      new Notification(message.title || 'Chaotic-AUR update', message);
    }
  }
}
