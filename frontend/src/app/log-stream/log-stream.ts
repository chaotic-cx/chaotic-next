import { computed, DestroyRef, inject, signal } from '@angular/core';
import { parseLogChunk } from '../functions';
import { ResilientSseStream } from '../sse-stream';
import { LogStreamState } from '../xterm-log/log-stream-status.component';

export interface LogStreamOptions {
  /**
   * Called with every text chunk, after the chunk is added to `chunks`.
   */
  onText?: (text: string) => void;
  /**
   * Called once the stream ended: the log is complete, or every reconnect failed.
   */
  onEnd?: () => void;
  /**
   * State for a log that ended without a line. The default is `empty`.
   */
  emptyState?: () => LogStreamState;
  /**
   * State for a stream that failed before its first line. The default is `failed`.
   */
  failedWithoutLinesState?: () => LogStreamState;
}

/**
 * One streamed build log: its received chunks and its lifecycle state for the log-stream status line.
 * A dropped stream resumes from the last received offset.
 */
export class LogStream {
  readonly chunks = signal<string[]>([]);
  readonly state = signal<LogStreamState>('connecting');
  readonly live = computed(() => this.state() === 'live');

  private stream: ResilientSseStream | undefined;
  private completed = false;
  private offset = 0;

  constructor(private readonly options: LogStreamOptions = {}) {}

  /**
   * Drops the current log and waits for a new one.
   */
  reset(): void {
    this.close();
    this.chunks.set([]);
    this.state.set('connecting');
    this.completed = false;
    this.offset = 0;
  }

  /**
   * Starts a new log. `url` builds the stream URL that resumes after `offset` characters.
   */
  start(url: (offset: number) => string): void {
    this.reset();
    this.stream = new ResilientSseStream({
      url: () => url(this.offset),
      onMessage: (data) => this.onMessage(data),
      onOpen: () => this.onOpen(),
      onError: () => this.onError(),
      onErrorExhausted: () => this.onErrorExhausted(),
    });
    this.stream.open();
  }

  close(): void {
    this.stream?.close();
    this.stream = undefined;
  }

  private onMessage(data: string): void {
    const chunk = parseLogChunk(data);
    if (!chunk) {
      return;
    }

    if (chunk.complete) {
      this.completed = true;
      this.state.set(this.hasLines() ? 'complete' : this.emptyState());
      this.close();
      this.options.onEnd?.();
      return;
    }

    // Only once a running job produces output is it actually "live".
    this.state.set('live');
    if (chunk.text) {
      this.offset = chunk.offset;
      this.chunks.update((chunks) => [...chunks, chunk.text]);
      this.options.onText?.(chunk.text);
    }
  }

  private onOpen(): void {
    if (this.state() !== 'reconnecting') {
      return;
    }

    this.state.set(this.hasLines() ? 'live' : 'connecting');
  }

  private onError(): void {
    if (!this.completed) {
      this.state.set('reconnecting');
    }
  }

  private onErrorExhausted(): void {
    this.state.set(this.hasLines() ? 'failed' : this.failedWithoutLinesState());
    this.options.onEnd?.();
  }

  private hasLines(): boolean {
    return this.chunks().length > 0;
  }

  private emptyState(): LogStreamState {
    return this.options.emptyState?.() ?? 'empty';
  }

  private failedWithoutLinesState(): LogStreamState {
    return this.options.failedWithoutLinesState?.() ?? 'failed';
  }
}

/**
 * Creates a log stream that closes with the calling component. Call it in an injection context.
 */
export function createLogStream(options: LogStreamOptions = {}): LogStream {
  const stream = new LogStream(options);
  inject(DestroyRef).onDestroy(() => stream.close());
  return stream;
}
