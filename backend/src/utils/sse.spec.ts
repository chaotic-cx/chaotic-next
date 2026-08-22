import { describe, expect, it, vi, afterEach } from 'vitest';
import { Subject } from 'rxjs';
import { withSseKeepalive } from './sse';

describe('withSseKeepalive', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes source frames through and completes with the source', () => {
    vi.useFakeTimers();
    const frames: unknown[] = [];
    const subject = new Subject<{ data: string }>();

    withSseKeepalive(subject.asObservable()).subscribe({
      next: (frame) => frames.push(frame),
      complete: () => frames.push('completed'),
    });

    subject.next({ data: 'chunk' });
    subject.complete();

    expect(frames).toEqual([{ data: 'chunk' }, 'completed']);
  });

  it('emits empty-data keepalives while the stream is quiet', () => {
    vi.useFakeTimers();
    const never = new Subject<{ id?: string }>();
    const frames: unknown[] = [];

    withSseKeepalive(never, 1000).subscribe((frame) => frames.push(frame));
    vi.advanceTimersByTime(2500);

    expect(frames).toEqual([{ data: '' }, { data: '' }]);
  });

  it('stops keepalives once unsubscribed', () => {
    vi.useFakeTimers();
    const never = new Subject<{ id?: string }>();
    const frames: unknown[] = [];

    const subscription = withSseKeepalive(never, 1000).subscribe((frame) => frames.push(frame));
    vi.advanceTimersByTime(1000);
    subscription.unsubscribe();
    vi.advanceTimersByTime(5000);

    expect(frames).toHaveLength(1);
  });
});
