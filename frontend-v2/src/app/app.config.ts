import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideGarudaNG } from '@garudalinux/core';
import { Catppuccin } from './theme';
import { provideSFConfig } from 'ngx-highlight-js';

export const appConfig: ApplicationConfig = {
  providers: [
    provideAnimationsAsync(),
    provideGarudaNG(
      { font: 'Fira Sans' },
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
    provideHttpClient(withInterceptorsFromDi()),
    provideRouter(routes),
    provideSFConfig({ lang: 'shell' }),
    provideZoneChangeDetection({ eventCoalescing: true }),
  ],
};
