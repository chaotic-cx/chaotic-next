import { HttpParams } from '@angular/common/http';
import { describe, expect, it } from 'vitest';
import { isEntryFresh, QUERY_CACHE_MAX_AGE_MS, requestKey } from './query-cache.service';

const REQUESTED_AT = 1_000_000;

describe('isEntryFresh', () => {
  it('keeps an entry fresh without an invalidation and inside the max age', () => {
    expect(isEntryFresh(REQUESTED_AT, 0, REQUESTED_AT + 1)).toBe(true);
  });

  it('marks an entry stale when a build event arrived after the request started', () => {
    expect(isEntryFresh(REQUESTED_AT, REQUESTED_AT + 1, REQUESTED_AT + 2)).toBe(false);
  });

  it('marks an entry stale when the build event arrived at the same time as the request', () => {
    expect(isEntryFresh(REQUESTED_AT, REQUESTED_AT, REQUESTED_AT + 1)).toBe(false);
  });

  it('keeps an entry fresh when the request started after the last build event', () => {
    expect(isEntryFresh(REQUESTED_AT, REQUESTED_AT - 1, REQUESTED_AT + 1)).toBe(true);
  });

  it('marks an entry stale after the max age', () => {
    expect(isEntryFresh(REQUESTED_AT, 0, REQUESTED_AT + QUERY_CACHE_MAX_AGE_MS + 1)).toBe(false);
  });
});

describe('requestKey', () => {
  it('gives the same key for HttpParams and a plain params object', () => {
    const fromHttpParams = requestKey({ url: '/packages', params: new HttpParams().set('page', 2).set('q', 'mesa') });
    const fromObject = requestKey({ url: '/packages', params: { page: 2, q: 'mesa' } });

    expect(fromHttpParams).toBe(fromObject);
  });

  it('gives different keys for different params', () => {
    expect(requestKey({ url: '/packages', params: { page: 1 } })).not.toBe(
      requestKey({ url: '/packages', params: { page: 2 } }),
    );
  });

  it('handles a request without params', () => {
    expect(requestKey({ url: '/repos' })).toBe('/repos?');
  });
});
