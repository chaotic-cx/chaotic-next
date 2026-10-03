import { HttpClient, httpResource } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { type NotificationPreferenceDto, type NotificationType } from '@chaotic-next/shared-lib';
import { TranslocoDirective } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { PrimeTemplate } from '@openng/optimus-ui/api';
import { Panel } from '@openng/optimus-ui/panel';
import { ToggleSwitchModule } from '@openng/optimus-ui/toggleswitch';
import { firstValueFrom } from 'rxjs';
import { APP_CONFIG } from '../../../environments/app-config.token';
import { LoadErrorComponent } from '../../load-error/load-error.component';
import { areNotificationsSupported } from '../../notification/notification.service';

const TYPE_LABEL_KEYS: Record<NotificationType, string> = {
  'build-failure': marker('settings.notifications.types.buildFailure'),
  'mr-review': marker('settings.notifications.types.mrReview'),
};

const SKELETON_ROW_COUNT = 2;

/**
 * Why the browser cannot show push notifications, or null when it can.
 */
function notificationBlockerKey(): string | null {
  if (!areNotificationsSupported()) {
    return marker('settings.notifications.unsupported');
  }

  if (Notification.permission === 'denied') {
    return marker('settings.notifications.blocked');
  }

  return null;
}

@Component({
  selector: 'chaotic-notification-settings-section',
  templateUrl: './notification-settings-section.component.html',
  imports: [FormsModule, PrimeTemplate, Panel, ToggleSwitchModule, TranslocoDirective, LoadErrorComponent],
})
export class NotificationSettingsSectionComponent {
  private readonly http = inject(HttpClient);
  private readonly backendUrl = inject(APP_CONFIG).backendUrl;

  readonly typeLabelKeys = TYPE_LABEL_KEYS;
  readonly saving = signal(false);
  readonly saveFailed = signal(false);

  readonly preferencesResource = httpResource<NotificationPreferenceDto[]>(() => ({
    url: `${this.backendUrl}/notifications/preferences`,
    method: 'GET',
  }));

  protected readonly skeletonRows = Array.from({ length: SKELETON_ROW_COUNT });
  protected readonly browserHintKey = notificationBlockerKey();

  async setEnabled(type: NotificationType, enabled: boolean): Promise<void> {
    this.preferencesResource.update((prefs) =>
      prefs?.map((pref) => (pref.type === type ? { ...pref, enabled } : pref)),
    );
    this.saving.set(true);
    this.saveFailed.set(false);
    try {
      await firstValueFrom(this.http.put<void>(`${this.backendUrl}/notifications/preferences`, [{ type, enabled }]));
    } catch {
      this.saveFailed.set(true);
      this.preferencesResource.reload();
    } finally {
      this.saving.set(false);
    }
  }
}
