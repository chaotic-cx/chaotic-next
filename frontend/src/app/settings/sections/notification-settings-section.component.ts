import { HttpClient, httpResource } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { type NotificationPreferenceDto, type NotificationType } from '@chaotic-next/shared-lib';
import { PrimeTemplate } from '@openng/optimus-ui/api';
import { Panel } from '@openng/optimus-ui/panel';
import { ToggleSwitchModule } from '@openng/optimus-ui/toggleswitch';
import { firstValueFrom } from 'rxjs';
import { APP_CONFIG } from '../../../environments/app-config.token';

const TYPE_LABELS: Record<NotificationType, string> = {
  'build-failure': 'Build failures (only non-transient)',
  'mr-review': 'Merge request reviews',
};

@Component({
  selector: 'chaotic-notification-settings-section',
  templateUrl: './notification-settings-section.component.html',
  imports: [FormsModule, PrimeTemplate, Panel, ToggleSwitchModule],
})
export class NotificationSettingsSectionComponent {
  private readonly http = inject(HttpClient);
  private readonly backendUrl = inject(APP_CONFIG).backendUrl;

  readonly typeLabels = TYPE_LABELS;
  readonly saving = signal(false);
  readonly saveFailed = signal(false);

  readonly preferencesResource = httpResource<NotificationPreferenceDto[]>(() => ({
    url: `${this.backendUrl}/notifications/preferences`,
    method: 'GET',
  }));

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
