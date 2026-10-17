import {
  afterNextRender,
  DestroyRef,
  DOCUMENT,
  type EnvironmentProviders,
  inject,
  Injector,
  isDevMode,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, TitleStrategy } from '@angular/router';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { first, firstValueFrom } from 'rxjs';
import { AVAILABLE_LANGUAGES, DEFAULT_LANGUAGE, resolveInitialLanguage } from './languages';
import { TranslatedTitleStrategy } from './translated-title.strategy';
import { TranslocoHttpLoader } from './transloco-http.loader';

// Keep in sync with the pre-boot script in index.html.
const TRANSLATION_PENDING_STYLE_ID = 'i18n-pending';

/**
 * Loads the initial language before the first render, so sync `translate` calls never see missing keys.
 */
function preloadInitialLanguage(): Promise<unknown> {
  const transloco = inject(TranslocoService);
  const language = resolveInitialLanguage();
  transloco.setActiveLang(language);

  return firstValueFrom(transloco.load(language));
}

/**
 * Keeps `<html lang>` equal to the active language for screen readers and crawlers.
 */
function syncDocumentLanguage(): void {
  const document = inject(DOCUMENT);
  inject(TranslocoService)
    .langChanges$.pipe(takeUntilDestroyed(inject(DestroyRef)))
    .subscribe((language) => {
      document.documentElement.lang = language;
    });
}

/**
 * The pre-boot script in index.html hides prerendered English text with a style element while another language loads.
 * The first navigation ends after the translations of its route scope have loaded. The render after it shows them.
 */
function revealTranslatedPage(): void {
  const document = inject(DOCUMENT);
  const injector = inject(Injector);
  inject(Router)
    .events.pipe(first((event) => event instanceof NavigationEnd))
    .subscribe(() => {
      afterNextRender(() => document.getElementById(TRANSLATION_PENDING_STYLE_ID)?.remove(), { injector });
    });
}

export function provideI18n(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideTransloco({
      config: {
        availableLangs: [...AVAILABLE_LANGUAGES],
        defaultLang: DEFAULT_LANGUAGE,
        fallbackLang: DEFAULT_LANGUAGE,
        missingHandler: { useFallbackTranslation: true },
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
        // Prerendering reads the translation files before transloco-optimize flattens them, so it flattens at runtime.
        flatten: { aot: !isDevMode() && typeof window !== 'undefined' },
      },
      loader: TranslocoHttpLoader,
    }),
    provideAppInitializer(preloadInitialLanguage),
    provideAppInitializer(syncDocumentLanguage),
    provideAppInitializer(revealTranslatedPage),
    { provide: TitleStrategy, useClass: TranslatedTitleStrategy },
  ]);
}
