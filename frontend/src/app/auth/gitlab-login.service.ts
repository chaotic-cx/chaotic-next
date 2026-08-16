import { inject, Service } from '@angular/core';
import { Router } from '@angular/router';
import { APP_CONFIG } from '../../environments/app-config.token';
import { AuthService } from 'ngx-better-auth';
import { from, Observable, of, throwError } from 'rxjs';
import { catchError, filter, finalize, first, map, switchMap, timeout } from 'rxjs/operators';

const AUTH_CALLBACK_PATH = '/auth/callback';
const AUTH_REDIRECT_KEY = 'auth-redirect';
const OAUTH_TIMEOUT_MS = 300_000;
const SESSION_REFRESH_TIMEOUT_MS = 10_000;
const POPUP_WINDOW_NAME = 'gitlab-auth';
const POPUP_FEATURES = 'width=600,height=700';

export const AUTH_CALLBACK_MESSAGE = 'auth-callback';
export const AUTH_ERROR_MESSAGE = 'auth-error';
export const AUTH_RESULT_KEY = 'auth-result';
// ngx-better-auth's internal cross-tab session-sync channel. Writing a session
// event from the popup triggers the opener's session refetch without a reload.
export const AUTH_SESSION_SYNC_KEY = 'better-auth.message';

interface SignInResponse {
  url?: string;
  redirect?: boolean;
  error?: { code: string; message: string } | null;
}

function safeRedirectPath(returnPath: string | null): string {
  if (returnPath?.startsWith('/') && !returnPath.startsWith('//')) return returnPath;
  return '/';
}

@Service()
export class GitlabLoginService {
  private readonly config = inject(APP_CONFIG);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly authBaseURL = `${this.config.backendUrl}/api/auth`;

  login(returnPath: string): Observable<void> {
    sessionStorage.setItem(AUTH_REDIRECT_KEY, returnPath);
    localStorage.removeItem(AUTH_RESULT_KEY);
    const popup = window.open('', POPUP_WINDOW_NAME, POPUP_FEATURES);

    if (!popup) {
      return throwError(() => new Error('Popup blocked by browser'));
    }

    const callbackURL = window.location.origin + AUTH_CALLBACK_PATH;

    return from(
      fetch(`${this.authBaseURL}/sign-in/oauth2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          providerId: 'gitlab',
          callbackURL,
          errorCallbackURL: callbackURL,
          newUserCallbackURL: callbackURL,
          disableRedirect: true,
        }),
      }),
    ).pipe(
      switchMap((response) => response.json()),
      map((response: SignInResponse) => {
        if (response.error) throw new Error(response.error.message);
        if (!response.url) throw new Error('Failed to initiate sign-in');
        return response.url;
      }),
      switchMap((url) => this.openPopupAndWait(popup, url)),
      timeout(OAUTH_TIMEOUT_MS),
      finalize(() => popup.close()),
    );
  }

  private openPopupAndWait(popup: Window, authUrl: string): Observable<void> {
    popup.location.href = authUrl;

    return new Observable<void>((subscriber) => {
      const onMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        handleResult(event.data?.type);
      };

      const onStorage = (event: StorageEvent) => {
        if (event.key !== AUTH_RESULT_KEY) return;
        handleResult(event.newValue);
      };

      const completeLogin = () => {
        const destination = safeRedirectPath(sessionStorage.getItem(AUTH_REDIRECT_KEY));
        sessionStorage.removeItem(AUTH_REDIRECT_KEY);
        teardown();
        subscriber.complete();
        void this.awaitSessionThenNavigate(destination);
      };

      const handleResult = (result: string | null | undefined) => {
        if (result === AUTH_CALLBACK_MESSAGE) completeLogin();
        else if (result === AUTH_ERROR_MESSAGE) {
          teardown();
          subscriber.error(new Error('Authentication failed'));
        }
      };

      window.addEventListener('message', onMessage);
      window.addEventListener('storage', onStorage);

      const checkClosed = setInterval(() => {
        if (popup.closed) {
          teardown();
          subscriber.error(new Error('Authentication cancelled'));
        }
      }, 500);

      const timeoutId = setTimeout(() => {
        teardown();
        subscriber.error(new Error('Authentication timed out'));
      }, OAUTH_TIMEOUT_MS);

      function teardown() {
        window.removeEventListener('message', onMessage);
        window.removeEventListener('storage', onStorage);
        clearInterval(checkClosed);
        clearTimeout(timeoutId);
      }

      return teardown;
    });
  }

  private awaitSessionThenNavigate(destination: string): void {
    this.authService.sessionState$
      .pipe(
        filter((session) => session !== null),
        first(),
        timeout({ first: SESSION_REFRESH_TIMEOUT_MS }),
        catchError(() => of(undefined)),
      )
      .subscribe(() => void this.router.navigateByUrl(destination));
  }
}
