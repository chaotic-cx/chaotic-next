import { inject, Service } from '@angular/core';
import { type PreloadingStrategy, type Route } from '@angular/router';
import { AuthService } from 'ngx-better-auth';
import { type Observable, of } from 'rxjs';

export const PRELOAD_DATA_KEY = 'preload';
export const SKIP_PRELOAD_DATA: Readonly<Record<string, PreloadMode>> = Object.freeze({
  [PRELOAD_DATA_KEY]: false,
});
export const AUTH_PRELOAD_DATA: Readonly<Record<string, PreloadMode>> = Object.freeze({
  [PRELOAD_DATA_KEY]: 'authenticated',
});

/**
 * Route data value controlling idle-time preloading:
 * - absent: always preload
 * - false: never preload
 * - 'authenticated': preload only when a session exists
 */
type PreloadMode = boolean | 'authenticated';

@Service()
export class SelectivePreloadStrategy implements PreloadingStrategy {
  private readonly authService = inject(AuthService);

  preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    const mode = route.data?.[PRELOAD_DATA_KEY] as PreloadMode | undefined;
    if (mode === false) {
      return of(null);
    }
    if (mode === 'authenticated' && !this.authService.isLoggedIn()) {
      return of(null);
    }
    return load();
  }
}
