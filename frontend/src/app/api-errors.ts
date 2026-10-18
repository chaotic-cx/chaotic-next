import { HttpErrorResponse, HttpStatusCode } from '@angular/common/http';

export function backendErrorMessage(error: unknown, fallback: string): string {
  if (
    error instanceof HttpErrorResponse &&
    typeof error.error?.message === 'string' &&
    error.error.message.length > 0
  ) {
    return error.error.message;
  }
  return fallback;
}

/**
 * Why a request failed, so a page can tell a missing record from a broken connection.
 * `offline`: the browser has no network. `unreachable`: no response while online.
 * `notFound`: HTTP 404. `rateLimited`: HTTP 429. `permission`: HTTP 401 or 403.
 * `server`: every other failure.
 */
export type RequestFailure = 'offline' | 'unreachable' | 'notFound' | 'rateLimited' | 'permission' | 'server';

// HttpClient reports status 0 when no HTTP response arrived.
export const NO_RESPONSE_STATUS = 0;

const FAILURE_BY_STATUS: ReadonlyMap<number, RequestFailure> = new Map([
  [NO_RESPONSE_STATUS, 'unreachable'],
  [HttpStatusCode.NotFound, 'notFound'],
  [HttpStatusCode.TooManyRequests, 'rateLimited'],
  [HttpStatusCode.Unauthorized, 'permission'],
  [HttpStatusCode.Forbidden, 'permission'],
]);

/**
 * Classifies a failed request. Pass `online` in tests; it defaults to the browser state.
 */
export function requestFailure(error: unknown, online = navigator.onLine): RequestFailure {
  if (!online) return 'offline';

  if (!(error instanceof HttpErrorResponse)) return 'server';

  return FAILURE_BY_STATUS.get(error.status) ?? 'server';
}
