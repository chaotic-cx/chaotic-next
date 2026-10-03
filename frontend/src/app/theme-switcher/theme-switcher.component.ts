import { Component, computed, inject } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { type MenuItem } from '@openng/optimus-ui/api';
import { Button } from '@openng/optimus-ui/button';
import { Menu } from '@openng/optimus-ui/menu';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { injectActiveTranslation } from '../i18n/active-translation';
import { alignMenuEnd } from '../menu-align';
import { THEME_PREFERENCES, type ThemePreference } from './theme-preference';
import { ThemeService } from './theme.service';

const PREFERENCE_ICONS: Record<ThemePreference, string> = {
  system: 'pi pi-desktop',
  light: 'pi pi-sun',
  dark: 'pi pi-moon',
};

const PREFERENCE_LABEL_KEYS: Record<ThemePreference, string> = {
  system: marker('themeSwitcher.system'),
  light: marker('themeSwitcher.light'),
  dark: marker('themeSwitcher.dark'),
};

@Component({
  selector: 'chaotic-theme-switcher',
  imports: [Button, Menu, Tooltip, TranslocoDirective],
  templateUrl: './theme-switcher.component.html',
})
export class ThemeSwitcherComponent {
  private readonly themeService = inject(ThemeService);
  private readonly transloco = inject(TranslocoService);

  private readonly activeTranslation = injectActiveTranslation();

  protected readonly preferenceIcon = computed(() => PREFERENCE_ICONS[this.themeService.preference()]);

  protected readonly preferenceLabel = computed(() => {
    this.activeTranslation();

    return this.transloco.translate(PREFERENCE_LABEL_KEYS[this.themeService.preference()]);
  });

  protected readonly themeItems = computed<MenuItem[]>(() => {
    this.activeTranslation();

    const activePreference = this.themeService.preference();
    const items: MenuItem[] = [];

    for (const preference of THEME_PREFERENCES) {
      items.push({
        label: this.transloco.translate(PREFERENCE_LABEL_KEYS[preference]),
        icon: PREFERENCE_ICONS[preference],
        state: { active: preference === activePreference },
        command: () => this.themeService.setPreference(preference),
      });
    }

    return items;
  });

  protected readonly alignMenuEnd = alignMenuEnd;
}
