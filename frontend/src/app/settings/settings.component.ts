import { Component } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { TitleComponent } from '../title/title.component';
import { NotificationSettingsSectionComponent } from './sections/notification-settings-section.component';

@Component({
  selector: 'chaotic-settings',
  imports: [TitleComponent, NotificationSettingsSectionComponent, TranslocoDirective],
  templateUrl: './settings.component.html',
})
export class SettingsComponent {}
