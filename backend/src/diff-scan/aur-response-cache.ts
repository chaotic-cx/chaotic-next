const CACHE_TTL_MS = 5 * 60 * 1000;
const FAILURE_TTL_MS = 60 * 1000;
const MAX_ENTRIES = 500;
const MAX_CACHED_BODY_BYTES = 2 * 1024 * 1024;

interface CachedResponse {
  body: string;
  contentType: string | null;
  expiresAt: number;
  status: number;
}

/**
 * Size-bounded in-memory cache for AUR HTTP responses. Successful responses are
 * reused across scans to shield aur.archlinux.org from repeated public scans,
 * while failures are cached briefly so unknown packages cannot be hammered.
 */
export class AurResponseCache {
  private readonly entries = new Map<string, CachedResponse>();
  private readonly inFlight = new Map<string, Promise<CachedResponse>>();

  async run(url: string, sendRequest: () => Promise<Response>): Promise<Response> {
    const cached = this.reuseIfFresh(url);
    if (cached) return toFetchResponse(cached);

    const pending = this.inFlight.get(url);
    if (pending) return toFetchResponse(await pending);

    const request = sendRequest()
      .then((response) => this.cacheResponse(url, response))
      .finally(() => this.inFlight.delete(url));
    this.inFlight.set(url, request);
    return toFetchResponse(await request);
  }

  clear(): void {
    this.entries.clear();
  }

  private reuseIfFresh(url: string): CachedResponse | null {
    const entry = this.entries.get(url);
    if (!entry) return null;
    if (Date.now() >= entry.expiresAt) {
      this.entries.delete(url);
      return null;
    }
    // Refresh recency so frequently scanned packages survive eviction.
    this.entries.delete(url);
    this.entries.set(url, entry);
    return entry;
  }

  private async cacheResponse(url: string, response: Response): Promise<CachedResponse> {
    const body = await response.text();
    const entry: CachedResponse = {
      body,
      contentType: response.headers.get('content-type'),
      expiresAt: Date.now() + (response.ok ? CACHE_TTL_MS : FAILURE_TTL_MS),
      status: response.status,
    };
    if (body.length <= MAX_CACHED_BODY_BYTES) {
      this.entries.set(url, entry);
      while (this.entries.size > MAX_ENTRIES) {
        const oldest = this.entries.keys().next();
        if (oldest.done) break;
        this.entries.delete(oldest.value);
      }
    }
    return entry;
  }
}

function toFetchResponse(cached: CachedResponse): Response {
  return new Response(cached.body, {
    headers: cached.contentType ? { 'content-type': cached.contentType } : undefined,
    status: cached.status,
  });
}
