import { HttpErrorResponse, type HttpInterceptorFn, HttpStatusCode } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from 'ngx-better-auth';
import { tap } from 'rxjs';
import { APP_CONFIG } from '../../environments/app-config.token';
import { SessionExpiryService } from './session-expiry.service';

/**
 * Reports a 401 from the backend while the user is signed in, so the app can offer a new sign-in.
 * Sign-in requests and requests of signed-out users pass through unchanged.
 */
export const sessionExpiryInterceptor: HttpInterceptorFn = (request, next) => {
  const config = inject(APP_CONFIG);
  const isBackendRequest = request.url.startsWith(config.backendUrl);
  const isAuthRequest = request.url.startsWith(config.authBaseUrl);
  if (!isBackendRequest || isAuthRequest) {
    return next(request);
  }

  const signedIn = inject(AuthService).isLoggedIn();
  if (!signedIn) {
    return next(request);
  }

  const sessionExpiry = inject(SessionExpiryService);

  return next(request).pipe(
    tap({
      error: (error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === HttpStatusCode.Unauthorized) {
          void sessionExpiry.reportUnauthorized();
        }
      },
    }),
  );
};
