import { Component } from '@angular/core';
import { TitleComponent } from '../title/title.component';
import { NotificationSettingsSectionComponent } from './sections/notification-settings-section.component';

@Component({
  selector: 'chaotic-settings',
  templateUrl: './settings.component.html',
  imports: [TitleComponent, NotificationSettingsSectionComponent],
})
export class SettingsComponent {}
