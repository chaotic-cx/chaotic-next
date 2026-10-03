import { computed, effect, inject, Service, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { type RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { injectActiveTranslation } from './active-translation';

// The home title is the site name already, so it gets no " · Chaotic-AUR" suffix.
const HOME_TITLE_KEY = 'routes.home';

/**
 * Treats each route `title` as a translation key and appends the site name.
 * The document title follows language changes without a new navigation.
 */
@Service()
export class TranslatedTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly transloco = inject(TranslocoService);
  private readonly activeTranslation = injectActiveTranslation();

  private readonly titleKey = signal<string | undefined>(undefined);

  private readonly documentTitle = computed(() => {
    this.activeTranslation();

    const titleKey = this.titleKey();
    if (titleKey === undefined) return undefined;

    const page = this.transloco.translate(titleKey);
    if (titleKey === HOME_TITLE_KEY) {
      return page;
    }

    return this.transloco.translate('routes.titleFormat', { page });
  });

  constructor() {
    super();

    effect(() => {
      const documentTitle = this.documentTitle();
      if (documentTitle !== undefined) this.title.setTitle(documentTitle);
    });
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const titleKey = this.buildTitle(snapshot);
    if (titleKey !== undefined) this.titleKey.set(titleKey);
  }
}
