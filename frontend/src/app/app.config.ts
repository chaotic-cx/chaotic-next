import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  isDevMode,
  LOCALE_ID,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling, withPreloading } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { provideGarudaNG } from '@garudalinux/core';
import { CatppuccinAura } from '@garudalinux/themes/catppuccin';
import { provideBetterAuth } from 'ngx-better-auth';
import { provideHighlightOptions } from 'ngx-highlightjs';
import { APP_CONFIG } from '../environments/app-config.token';
import { environment } from '../environments/environment.dev';
import { routes } from './app.routes';
import { provideAuthInitializer } from './auth/auth-initializer';
import { provideBackendStatusInitializer } from './backend-status/backend-status-initializer';
import { HttpRequestInterceptor } from './loading/loading.interceptor';
import { NotificationService } from './notification/notification.service';
import { SelectivePreloadStrategy } from './preload.strategy';

/** True when the app runs as an installed PWA (standalone window), not a regular browser tab. */
function isPwaInstalled(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true)
  );
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideGarudaNG(
      { font: 'Inter Variable' },
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
        bash: () => import('highlight.js/lib/languages/bash'),
        shell: () => import('highlight.js/lib/languages/shell'),
      },
    }),
    provideBetterAuth({
      baseURL: environment.authBaseUrl,
    }),
    provideAuthInitializer(),
    provideBackendStatusInitializer(),
    provideHttpClient(withInterceptorsFromDi()),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({
        scrollPositionRestoration: 'top',
        anchorScrolling: 'enabled',
      }),
      withPreloading(SelectivePreloadStrategy),
    ),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode() && isPwaInstalled(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    provideZonelessChangeDetection(),
    provideAppInitializer(() => {
      inject(NotificationService);
    }),
    { provide: APP_CONFIG, useValue: environment },
    { provide: LOCALE_ID, useValue: navigator.language },
    { provide: HTTP_INTERCEPTORS, useClass: HttpRequestInterceptor, multi: true },
  ],
};
