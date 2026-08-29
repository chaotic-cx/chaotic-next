import { HttpClient } from '@angular/common/http';
import { inject, Service, signal } from '@angular/core';
import { pushSubscriptionBodySchema, type SubscriptionStatusDto } from '@chaotic-next/shared-lib';
import { AuthService } from 'ngx-better-auth';
import { catchError, first, firstValueFrom, lastValueFrom, map, type Observable, of, timeout } from 'rxjs';
import { APP_CONFIG } from '../../environments/app-config.token';

const NOTIFICATIONS_SUBSCRIBED_KEY = 'notifications-subscribed';
const SESSION_WAIT_TIMEOUT_MS = 60_000;
const PUSH_WORKER_URL = '/push/push-worker.js';
const PUSH_WORKER_SCOPE = '/push/';

export function areNotificationsSupported(): boolean {
  return (
    typeof window !== 'undefined' && 'Notification' in window && 'PushManager' in window && 'serviceWorker' in navigator
  );
}

function applicationServerKeyFrom(vapidPublicKey: string): Uint8Array<ArrayBuffer> {
  const raw = atob(vapidPublicKey.replace(/-/g, '+').replace(/_/g, '/'));
  const key = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) key[index] = raw.charCodeAt(index);
  return key;
}

@Service()
export class NotificationService {
  private readonly appConfig = inject(APP_CONFIG);
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  readonly isSupported = areNotificationsSupported();
  readonly notificationsEnabled = signal(false);

  constructor() {
    const stored = localStorage.getItem(NOTIFICATIONS_SUBSCRIBED_KEY) === 'true';
    this.notificationsEnabled.set(this.isSupported && Notification.permission === 'granted' && stored);

    void this.reconcileSubscription();
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

  /**
   * The server row is the source of truth for "subscribed". Granted permission
   * is treated as prior opt-in (it can only be granted through our prompt), so
   * the stored flag never blocks a re-subscribe: a wiped table, endpoint
   * rotation, or expiry all surface as a missing row and get healed. An
   * unauthenticated visit is a no-op.
   */
  private async reconcileSubscription(): Promise<void> {
    if (!this.isSupported || Notification.permission !== 'granted') return;
    let subscribed: boolean;
    try {
      const status = await lastValueFrom(
        this.http.get<SubscriptionStatusDto>(`${this.appConfig.backendUrl}/notifications/subscriptions/me`),
      );
      subscribed = status.subscribed;
    } catch (err) {
      console.warn('Push subscription state check failed', err);
      return;
    }
    if (subscribed) {
      localStorage.setItem(NOTIFICATIONS_SUBSCRIBED_KEY, 'true');
      this.notificationsEnabled.set(true);
      return;
    }
    this.notificationsEnabled.set(false);
    await this.subscribe();
  }

  /**
   * Subscriptions live on the dedicated /push/ worker, not on ngsw. This works
   * in regular browser tabs and installed PWAs alike.
   */
  private async subscribe(): Promise<void> {
    try {
      const registration =
        (await navigator.serviceWorker.getRegistration(PUSH_WORKER_SCOPE)) ??
        (await navigator.serviceWorker.register(PUSH_WORKER_URL, { scope: PUSH_WORKER_SCOPE }));
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKeyFrom(this.appConfig.vapidPublicKey),
      });

      // The backend only accepts subscriptions from authenticated sessions.
      // During the login click the permission prompt runs before any session
      // exists, so wait for the cookie instead of posting right away.
      const authenticated = await firstValueFrom(this.waitForSession());
      if (!authenticated) {
        console.warn('Push subscription skipped: no authenticated session appeared within the timeout');
        this.notificationsEnabled.set(false);
        return;
      }
      const ok = await this.sendSubscriptionToServer(subscription);
      localStorage.setItem(NOTIFICATIONS_SUBSCRIBED_KEY, String(ok));
      this.notificationsEnabled.set(ok);
    } catch (err) {
      // A swallowed error here looks identical to "user declined" and is near
      // impossible to diagnose; surface it instead.
      console.warn('Push subscription failed', err);
      this.notificationsEnabled.set(false);
    }
  }

  private waitForSession(): Observable<boolean> {
    return this.authService.sessionState$.pipe(
      map((session) => session !== null),
      first((authenticated) => authenticated),
      timeout({ first: SESSION_WAIT_TIMEOUT_MS }),
      catchError(() => of(false)),
    );
  }

  private async sendSubscriptionToServer(subscription: PushSubscription): Promise<boolean> {
    const parsed = pushSubscriptionBodySchema.safeParse(subscription.toJSON());
    if (!parsed.success) return false;
    try {
      await lastValueFrom(this.http.post(`${this.appConfig.backendUrl}/notifications/subscribe`, parsed.data));
      return true;
    } catch {
      return false;
    }
  }
}
