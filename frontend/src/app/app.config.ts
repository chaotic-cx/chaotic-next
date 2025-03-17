import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { ApplicationConfig, LOCALE_ID, provideExperimentalZonelessChangeDetection } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import { provideGarudaNG } from '@garudalinux/core';
import { provideHighlightOptions } from 'ngx-highlightjs';
import { APP_CONFIG } from '../environments/app-config.token';
import { environment } from '../environments/environment.dev';
import { routes } from './app.routes';
import { Catppuccin } from './theme';

export const appConfig: ApplicationConfig = {
  providers: [
    provideAnimationsAsync(),
    provideGarudaNG(
      { font: 'Inter' },
      {
        theme: {
          preset: Catppuccin,
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
    provideHttpClient(withInterceptorsFromDi()),
    provideRouter(routes),
    provideExperimentalZonelessChangeDetection(),
    { provide: APP_CONFIG, useValue: environment },
    { provide: LOCALE_ID, useValue: 'en-GB' },
  ],
};
