import { provideHttpClient, withFetch, withInterceptorsFromDi } from '@angular/common/http';
import {
  ApplicationConfig,
  LOCALE_ID,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import { provideGarudaNG } from '@garudalinux/core';
import { provideHighlightOptions } from 'ngx-highlightjs';
import { APP_CONFIG } from '../environments/app-config.token';
import { environment } from '../environments/environment.dev';
import { routes } from './app.routes';
import { CatppuccinAura } from '@garudalinux/themes/catppuccin';

export const appConfig: ApplicationConfig = {
  providers: [
    provideAnimationsAsync(),
    provideBrowserGlobalErrorListeners(),
    provideGarudaNG(
      { font: 'Inter' },
      {
        theme: {
          preset: CatppuccinAura,
          options: {
            darkModeSelector: '.dark-mode',
          },
        },
        ripple: true,
      },
    ),
    provideHighlightOptions({
      coreLibraryLoader: () => import('highlight.js/lib/core'),
      languages: {
        shell: () => import('highlight.js/lib/languages/shell.js'),
      },
    }),
    provideHttpClient(withInterceptorsFromDi(), withFetch()),
    provideRouter(routes),
    provideZonelessChangeDetection(),
    { provide: APP_CONFIG, useValue: environment },
    { provide: LOCALE_ID, useValue: 'en-GB' },
  ],
};
