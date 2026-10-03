import { Component, computed, inject } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { type MenuItem } from '@openng/optimus-ui/api';
import { Button } from '@openng/optimus-ui/button';
import { Menu } from '@openng/optimus-ui/menu';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { injectActiveTranslation } from '../i18n/active-translation';
import { AVAILABLE_LANGUAGES, storeLanguage } from '../i18n/languages';

const ACTIVE_ICON = 'pi pi-check';

/**
 * The name of a language in that language, e.g. "Deutsch" for `de`.
 * Every visitor can then find their own language in the list.
 */
function nativeLanguageName(language: string): string {
  const name = new Intl.DisplayNames([language], { type: 'language' }).of(language);

  return name ?? language;
}

@Component({
  selector: 'chaotic-language-switcher',
  imports: [Button, Menu, Tooltip, TranslocoDirective],
  templateUrl: './language-switcher.component.html',
})
export class LanguageSwitcherComponent {
  private readonly transloco = inject(TranslocoService);

  private readonly activeTranslation = injectActiveTranslation();

  protected readonly activeLanguage = computed(() => {
    this.activeTranslation();

    return this.transloco.getActiveLang();
  });

  protected readonly activeLanguageCode = computed(() => this.activeLanguage().toUpperCase());

  protected readonly activeLanguageName = computed(() => nativeLanguageName(this.activeLanguage()));

  protected readonly languageItems = computed<MenuItem[]>(() => {
    const activeLanguage = this.activeLanguage();
    const items: MenuItem[] = [];

    for (const language of AVAILABLE_LANGUAGES) {
      let icon: string | undefined;
      if (language === activeLanguage) {
        icon = ACTIVE_ICON;
      }

      items.push({
        label: nativeLanguageName(language),
        icon,
        command: () => this.selectLanguage(language),
      });
    }

    return items;
  });

  /**
   * Aligns the right edge of the popup with the right edge of the button.
   * By default the popup starts at the left edge of the button and runs out of the window.
   */
  protected alignMenuEnd(menu: Menu): void {
    const popup: HTMLElement | undefined = menu.container;
    const button: HTMLElement | undefined = menu.target;
    if (popup === undefined || button === undefined) {
      return;
    }

    const buttonRight = button.getBoundingClientRect().right + window.scrollX;
    const popupLeft = Math.max(0, buttonRight - popup.offsetWidth);
    popup.style.insetInlineStart = `${popupLeft}px`;
  }

  private selectLanguage(language: string): void {
    storeLanguage(language);
    this.transloco.setActiveLang(language);
  }
}
