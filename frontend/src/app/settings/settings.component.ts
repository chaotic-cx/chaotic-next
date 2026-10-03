import { Component } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { TitleComponent } from '../title/title.component';
import { NotificationSettingsSectionComponent } from './sections/notification-settings-section.component';

@Component({
  selector: 'chaotic-settings',
  templateUrl: './settings.component.html',
  imports: [TitleComponent, NotificationSettingsSectionComponent, TranslocoDirective],
})
export class SettingsComponent {}
