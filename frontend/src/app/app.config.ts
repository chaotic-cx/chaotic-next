import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  isDevMode,
  LOCALE_ID,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import {
  provideRouter,
  Router,
  withComponentInputBinding,
  withInMemoryScrolling,
  withViewTransitions,
} from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { provideGarudaNG } from '@garudalinux/core';
import { CatppuccinAura } from '@garudalinux/themes/catppuccin';
import { provideBetterAuth } from 'ngx-better-auth';
import { provideHighlightOptions } from 'ngx-highlightjs';
import { APP_CONFIG } from '../environments/app-config.token';
import { environment } from '../environments/environment.dev';
import { routes } from './app.routes';
import { provideAuthInitializer } from './auth/auth-initializer';
import { HttpRequestInterceptor } from './loading/loading.interceptor';

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
        shell: () => import('highlight.js/lib/languages/shell.js'),
      },
    }),
    provideBetterAuth({
      baseURL: environment.authBaseUrl,
    }),
    provideAuthInitializer(),
    provideHttpClient(withInterceptorsFromDi()),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({
        scrollPositionRestoration: 'top',
        anchorScrolling: 'enabled',
      }),
      withViewTransitions({
        skipInitialTransition: true,
        onViewTransitionCreated: ({ transition, from, to }) => {
          const router = inject(Router);
          try {
            const nav = router.currentNavigation();
            const info = nav?.extras?.info as { disableViewTransition?: boolean } | undefined;

            const fromSegments = from.url.map((s) => s.path);
            const toSegments = to.url.map((s) => s.path);
            if (fromSegments.length > 1 && toSegments.length > 1 && fromSegments[0] === toSegments[0]) {
              transition.skipTransition();
            }

            if (info?.disableViewTransition) {
              const style = document.createElement('style');
              style.id = 'skip-transition';
              style.textContent = '* { view-transition-name: none !important; }';
              document.head.appendChild(style);

              transition.finished.finally(() => {
                const el = document.getElementById('skip-transition');
                if (el) el.remove();
                document.body.classList.remove('is-transitioning');
              });
            } else {
              transition.finished.finally(() => {
                document.body.classList.remove('is-transitioning');
              });
            }
          } catch {
            // Ignore parse errors, let transition proceed
          }
        },
      }),
    ),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode() && isPwaInstalled(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    provideZonelessChangeDetection(),
    { provide: APP_CONFIG, useValue: environment },
    { provide: LOCALE_ID, useValue: 'en-GB' },
    { provide: HTTP_INTERCEPTORS, useClass: HttpRequestInterceptor, multi: true },
  ],
};
