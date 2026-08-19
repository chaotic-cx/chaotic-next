import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from 'ngx-better-auth';
import { filter, take, timeout } from 'rxjs';
import {
  AUTH_CALLBACK_MESSAGE,
  AUTH_ERROR_MESSAGE,
  AUTH_RESULT_KEY,
  AUTH_SESSION_SYNC_KEY,
} from './gitlab-login.service';

const SESSION_TIMEOUT_MS = 10_000;

function errorMessageForCode(code: string): string {
  if (code === 'user_info_is_missing') {
    return 'Only members of the Chaotic-AUR GitLab group are allowed to sign in.';
  }
  return 'Sign-in could not be completed. Please try again.';
}

@Component({
  selector: 'chaotic-auth-callback',
  template: `
    <div class="flex w-full items-center justify-center px-4 py-28 md:py-36">
      <div class="w-full max-w-sm rounded-2xl border border-ctp-surface1 p-8 shadow-lg backdrop-blur-md text-center">
        @if (errorMessage()) {
          <h1 class="text-ctp-text mt-6 text-2xl font-extrabold">Sign-in unavailable</h1>
          <p class="text-ctp-subtext mt-2 text-sm">{{ errorMessage() }}</p>
        } @else {
          <div class="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-ctp-surface1 border-t-ctp-blue"></div>
          <h1 class="text-ctp-text mt-6 text-2xl font-extrabold">Signing you in</h1>
          <p class="text-ctp-subtext mt-2 text-sm">Completing GitLab authentication...</p>
        }
      </div>
    </div>
  `,
})
export class AuthCallbackComponent {
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  readonly errorMessage = signal<string | null>(null);

  constructor() {
    const code = this.route.snapshot.queryParamMap.get('error');
    this.errorMessage.set(code ? errorMessageForCode(code) : null);

    if (this.errorMessage()) {
      return;
    }

    this.authService.sessionState$
      .pipe(
        filter((session) => session !== null),
        take(1),
        timeout(SESSION_TIMEOUT_MS),
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
