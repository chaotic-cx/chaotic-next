import { inject, Service } from '@angular/core';
import { type PreloadingStrategy, type Route } from '@angular/router';
import { AuthService } from 'ngx-better-auth';
import { Observable, of, switchMap } from 'rxjs';

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

const IDLE_PRELOAD_TIMEOUT_MS = 4000;
const SLOW_CONNECTION_TYPES = new Set(['slow-2g', '2g', '3g']);

interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
}

function isConstrainedNetwork(): boolean {
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  if (!connection) return false;
  return connection.saveData === true || SLOW_CONNECTION_TYPES.has(connection.effectiveType ?? '');
}

/** Emits once the browser is idle, so preloading never competes with the first render. */
function whenIdle(): Observable<void> {
  return new Observable<void>((subscriber) => {
    const done = (): void => {
      subscriber.next();
      subscriber.complete();
    };
    if ('requestIdleCallback' in window) {
      const handle = window.requestIdleCallback(done, { timeout: IDLE_PRELOAD_TIMEOUT_MS });
      return () => window.cancelIdleCallback(handle);
    }
    const handle = setTimeout(done, IDLE_PRELOAD_TIMEOUT_MS);
    return () => clearTimeout(handle);
  });
}

@Service()
export class SelectivePreloadStrategy implements PreloadingStrategy {
  private readonly authService = inject(AuthService);

  preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    const mode = route.data?.[PRELOAD_DATA_KEY] as PreloadMode | undefined;
    if (mode === false || isConstrainedNetwork()) return of(null);
    if (mode === 'authenticated' && !this.authService.isLoggedIn()) return of(null);
    return whenIdle().pipe(switchMap(() => load()));
  }
}
