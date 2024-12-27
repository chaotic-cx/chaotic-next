import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideGarudaNG } from '@garudalinux/core';
import { Catppuccin } from './theme';
import { provideHighlightOptions } from 'ngx-highlightjs';

export const appConfig: ApplicationConfig = {
  providers: [
    provideAnimationsAsync(),
    provideHighlightOptions({
      coreLibraryLoader: () => import('highlight.js/lib/core'),
      languages: {
        shell: () => import('highlight.js/lib/languages/shell'),
      },
    }),
    provideHttpClient(withInterceptorsFromDi()),
    provideGarudaNG(
      {},
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
    provideRouter(routes),
    provideZoneChangeDetection({ eventCoalescing: true }),
  ],
};
