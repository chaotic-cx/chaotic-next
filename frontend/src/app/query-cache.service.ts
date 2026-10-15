import { HttpParams, httpResource, type HttpResourceRef, type HttpResourceRequest } from '@angular/common/http';
import { computed, effect, inject, linkedSignal, Service, signal, type Signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { AppService } from './app.service';
import { resourceValue } from './functions';

export const QUERY_CACHE_MAX_AGE_MS = 5 * 60 * 1000;

interface QueryCacheEntry {
  value: unknown;
  requestedAt: number;
}

export interface CachedHttpResource<T> {
  resource: HttpResourceRef<T | undefined>;
  value: Signal<T | undefined>;
  refresh: () => void;
}

@Service()
export class QueryCacheService {
  private readonly entries = new Map<string, QueryCacheEntry>();
  private invalidatedAt = 0;

  constructor() {
    inject(AppService)
      .chaoticEvent.pipe(
        filter((event) => event.type === 'build'),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.invalidatedAt = Date.now();
      });
  }

  get<T>(key: string): T | undefined {
    return this.entries.get(key)?.value as T | undefined;
  }

  set(key: string, value: unknown, requestedAt: number): void {
    this.entries.set(key, { value, requestedAt });
  }

  markStale(key: string): void {
    const entry = this.entries.get(key);
    if (entry) {
      this.entries.set(key, { ...entry, requestedAt: 0 });
    }
  }

  isFresh(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;

    return isEntryFresh(entry.requestedAt, this.invalidatedAt, Date.now());
  }
}

export function isEntryFresh(requestedAt: number, invalidatedAt: number, now: number): boolean {
  const invalidated = requestedAt <= invalidatedAt;
  const expired = now - requestedAt > QUERY_CACHE_MAX_AGE_MS;
  return !invalidated && !expired;
}

export function requestKey(request: HttpResourceRequest): string {
  const params = request.params instanceof HttpParams ? request.params : new HttpParams({ fromObject: request.params });
  const query = params.toString();
  return `${request.url}?${query}`;
}

/**
 * An httpResource backed by QueryCacheService. A fresh cache entry skips the request.
 * A stale entry shows at once and the request refreshes it in the background.
 * Call it in an injection context.
 */
export function cachedHttpResource<T>(request: () => HttpResourceRequest | undefined): CachedHttpResource<T> {
  const cache = inject(QueryCacheService);
  const key = computed(() => {
    const current = request();
    return current ? requestKey(current) : undefined;
  });

  const refreshCount = signal(0);
  const resource = httpResource<T>(() => {
    refreshCount();
    const current = request();
    if (!current) return undefined;

    return cache.isFresh(requestKey(current)) ? undefined : current;
  });
  storeResolvedValues(cache, resource, key);

  const refresh = (): void => {
    const currentKey = key();
    if (currentKey !== undefined) {
      cache.markStale(currentKey);
    }

    /**
     * An idle resource skipped its request because the entry was fresh.
     * Only a changed request signal makes it fetch, reload() does nothing then.
     */
    if (resource.status() === 'idle') {
      refreshCount.update((count) => count + 1);
    } else {
      resource.reload();
    }
  };

  return { resource, value: cachedValue(cache, resource, key), refresh };
}

function storeResolvedValues<T>(
  cache: QueryCacheService,
  resource: HttpResourceRef<T | undefined>,
  key: Signal<string | undefined>,
): void {
  let requestedAt = 0;
  effect(() => {
    const status = resource.status();
    const currentKey = key();
    if (status === 'loading' || status === 'reloading') {
      requestedAt = Date.now();
    } else if (status === 'resolved' && currentKey !== undefined) {
      cache.set(currentKey, resource.value(), requestedAt);
    }
  });
}

function cachedValue<T>(
  cache: QueryCacheService,
  resource: HttpResourceRef<T | undefined>,
  key: Signal<string | undefined>,
): Signal<T | undefined> {
  return linkedSignal<T | undefined, T | undefined>({
    source: () => {
      const currentKey = key();
      const cached = currentKey === undefined ? undefined : cache.get<T>(currentKey);
      return resourceValue(resource) ?? cached;
    },
    computation: (next, previous) => next ?? previous?.value,
  });
}
