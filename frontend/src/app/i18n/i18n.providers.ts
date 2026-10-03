import {
  DestroyRef,
  DOCUMENT,
  type EnvironmentProviders,
  inject,
  isDevMode,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TitleStrategy } from '@angular/router';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { AVAILABLE_LANGUAGES, DEFAULT_LANGUAGE, resolveInitialLanguage } from './languages';
import { TranslatedTitleStrategy } from './translated-title.strategy';
import { TranslocoHttpLoader } from './transloco-http.loader';

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
        flatten: { aot: !isDevMode() },
      },
      loader: TranslocoHttpLoader,
    }),
    provideAppInitializer(preloadInitialLanguage),
    provideAppInitializer(syncDocumentLanguage),
    { provide: TitleStrategy, useClass: TranslatedTitleStrategy },
  ]);
}
