import { ApplicationConfig, LOCALE_ID, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideGarudaNG } from '@garudalinux/core';
import { provideSFConfig } from 'ngx-highlight-js';
import { APP_CONFIG } from '../environments/app-config.token';
import { environment } from '../environments/environment.dev';
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
    provideHttpClient(withInterceptorsFromDi()),
    provideRouter(routes),
    provideSFConfig({ lang: 'shell' }),
    provideZoneChangeDetection({ eventCoalescing: true }),
    { provide: APP_CONFIG, useValue: environment },
    { provide: LOCALE_ID, useValue: 'en-GB' },
  ],
};
