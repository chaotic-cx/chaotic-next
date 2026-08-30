import { Observable } from 'rxjs';

/** Interval between SSE keepalive frames; short enough to survive proxy idle timeouts. */
const SSE_KEEPALIVE_MS = 20_000;

/**
 * Server-sent event frame as emitted through Nest's @Sse(). Unlike the DOM
 * MessageEvent this carries the wire-level fields (`id`, `retry`, `comment`),
 * e.g. the `id` a browser replays as Last-Event-ID on native reconnect.
 */
export interface SseMessage<T = unknown> {
  data?: T | string;
  id?: string;
  type?: string;
  retry?: number;
  comment?: string;
}

/**
 * Merges empty-string data frames into an SSE stream so proxies do not reap
 * connections that are quiet between real events. Every frontend consumer
 * ignores empty payloads (JSON parsers reject them, text views skip them),
 * so this is invisible apart from keeping the socket alive.
 *
 * Completion and errors of the wrapped stream pass through and stop the
 * keepalives; the interval alone must never keep a finished stream open.
 */
export function withSseKeepalive<T>(stream$: Observable<T>, intervalMs: number = SSE_KEEPALIVE_MS): Observable<T> {
  return new Observable<T>((subscriber) => {
    let timer: ReturnType<typeof setInterval> | undefined;

    const sourceSubscription = stream$.subscribe({
      next: (frame) => subscriber.next(frame),
      error: (error) => {
        clearInterval(timer);
        subscriber.error(error);
      },
      complete: () => {
        clearInterval(timer);
        subscriber.complete();
      },
    });

    if (!sourceSubscription.closed) {
      timer = setInterval(() => subscriber.next({ data: '' } as unknown as T), intervalMs);
    }

    return () => {
      clearInterval(timer);
      sourceSubscription.unsubscribe();
    };
  });
}
