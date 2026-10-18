import { HttpErrorResponse, HttpStatusCode } from '@angular/common/http';
import { describe, expect, it } from 'vitest';
import { NO_RESPONSE_STATUS, requestFailure } from './api-errors';

function httpError(status: number): HttpErrorResponse {
  return new HttpErrorResponse({ status });
}

describe('requestFailure', () => {
  it('reports offline when the browser has no network, whatever the error', () => {
    expect(requestFailure(httpError(HttpStatusCode.NotFound), false)).toBe('offline');
    expect(requestFailure(new Error('boom'), false)).toBe('offline');
  });

  it('reports unreachable when no response arrived while online', () => {
    expect(requestFailure(httpError(NO_RESPONSE_STATUS), true)).toBe('unreachable');
  });

  it('maps 404 to notFound and 429 to rateLimited', () => {
    expect(requestFailure(httpError(HttpStatusCode.NotFound), true)).toBe('notFound');
    expect(requestFailure(httpError(HttpStatusCode.TooManyRequests), true)).toBe('rateLimited');
  });

  it('maps 401 and 403 to permission', () => {
    expect(requestFailure(httpError(HttpStatusCode.Unauthorized), true)).toBe('permission');
    expect(requestFailure(httpError(HttpStatusCode.Forbidden), true)).toBe('permission');
  });

  it('reports server for other statuses and for non-HTTP errors', () => {
    expect(requestFailure(httpError(HttpStatusCode.InternalServerError), true)).toBe('server');
    expect(requestFailure(httpError(HttpStatusCode.BadRequest), true)).toBe('server');
    expect(requestFailure(new Error('boom'), true)).toBe('server');
    expect(requestFailure(undefined, true)).toBe('server');
  });
});
