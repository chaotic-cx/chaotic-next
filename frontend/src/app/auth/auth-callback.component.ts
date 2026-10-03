import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { AuthService } from 'ngx-better-auth';
import { filter, take, timeout } from 'rxjs';
import {
  AUTH_CALLBACK_MESSAGE,
  AUTH_ERROR_MESSAGE,
  AUTH_RESULT_KEY,
  AUTH_SESSION_SYNC_KEY,
} from './gitlab-login.service';

const SESSION_TIMEOUT_MS = 10_000;

const ERROR_KEYS_BY_CODE: Record<string, string> = {
  user_info_is_missing: marker('auth.callback.errors.notMember'),
};

const GENERIC_ERROR_KEY = marker('auth.callback.errors.generic');

function errorKeyForCode(code: string): string {
  return ERROR_KEYS_BY_CODE[code] ?? GENERIC_ERROR_KEY;
}

@Component({
  selector: 'chaotic-auth-callback',
  imports: [TranslocoDirective],
  template: `
    <div class="flex w-full items-center justify-center px-4 py-28 md:py-36" *transloco="let t">
      <div
        class="w-full max-w-sm rounded-2xl border border-ctp-surface1 p-8 shadow-lg backdrop-blur-(--chaotic-blur) text-center"
      >
        @if (errorKey(); as errorKey) {
          <h1 class="text-ctp-text mt-6 text-2xl font-extrabold">{{ t('auth.callback.unavailable') }}</h1>
          <p class="text-ctp-subtext mt-2 text-sm">{{ t(errorKey) }}</p>
        } @else {
          <div class="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-ctp-surface1 border-t-ctp-blue"></div>
          <h1 class="text-ctp-text mt-6 text-2xl font-extrabold">{{ t('auth.callback.signingIn') }}</h1>
          <p class="text-ctp-subtext mt-2 text-sm">{{ t('auth.callback.completing') }}</p>
        }
      </div>
    </div>
  `,
})
export class AuthCallbackComponent {
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  readonly errorKey = signal<string | null>(null);

  constructor() {
    const code = this.route.snapshot.queryParamMap.get('error');
    this.errorKey.set(code ? errorKeyForCode(code) : null);

    if (this.errorKey()) {
      return;
    }

    this.authService.sessionState$
      .pipe(
        filter((session) => session !== null),
        take(1),
        timeout(SESSION_TIMEOUT_MS),
        // Bound by destruction too: without it the wait outlives a navigated-away page.
        takeUntilDestroyed(),
      )
      .subscribe({
        next: () => this.finish(AUTH_CALLBACK_MESSAGE),
        error: () => this.finish(AUTH_ERROR_MESSAGE),
      });
  }

  private finish(message: string): void {
    localStorage.setItem(AUTH_RESULT_KEY, message);
    localStorage.setItem(
      AUTH_SESSION_SYNC_KEY,
      JSON.stringify({
        event: 'session',
        data: { trigger: 'sign-in' },
        clientId: Math.random().toString(36).substring(7),
        timestamp: Math.floor(Date.now() / 1000),
      }),
    );
    const opener = window.opener;
    if (opener) {
      opener.postMessage({ type: message }, window.location.origin);
    }
    window.close();
  }
}
