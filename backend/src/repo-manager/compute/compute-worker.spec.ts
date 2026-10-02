import { EventEmitter } from 'node:events';
import { type MessagePort } from 'node:worker_threads';
import { describe, expect, it } from 'vitest';
import { type ComputeOps } from './compute-ops';
import { type ComputeWorkerMessage } from './compute-protocol';
import { serveRequests } from './compute-worker';

class FakePort extends EventEmitter {
  readonly sent: ComputeWorkerMessage[] = [];
  postMessage(message: ComputeWorkerMessage): void {
    this.sent.push(message);
  }
}

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 10));
}

describe('serveRequests', () => {
  it('answers each request with its result, one request after another', async () => {
    const order: string[] = [];
    const ops = {
      countUncoveredMissedBreaks: async () => {
        order.push('count:start');
        await settle();
        order.push('count:end');
        return 3;
      },
      invalidateDirectoryIndex: async () => {
        order.push('invalidate');
      },
    } as unknown as ComputeOps;
    const port = new FakePort();

    serveRequests(port as unknown as MessagePort, Promise.resolve(ops));
    port.emit('message', { id: 1, op: 'countUncoveredMissedBreaks', args: {} });
    port.emit('message', { id: 2, op: 'invalidateDirectoryIndex', args: {} });
    await settle();
    await settle();

    expect(order).toEqual(['count:start', 'count:end', 'invalidate']);
    expect(port.sent).toEqual([
      { type: 'result', id: 1, result: 3 },
      { type: 'result', id: 2, result: undefined },
    ]);
  });

  it('answers a failed operation with its error and keeps serving', async () => {
    const ops = {
      rebuildCoverage: async () => {
        throw new Error('database gone');
      },
      countUncoveredMissedBreaks: async () => 0,
    } as unknown as ComputeOps;
    const port = new FakePort();

    serveRequests(port as unknown as MessagePort, Promise.resolve(ops));
    port.emit('message', { id: 1, op: 'rebuildCoverage', args: {} });
    port.emit('message', { id: 2, op: 'countUncoveredMissedBreaks', args: {} });
    await settle();

    expect(port.sent[0]).toMatchObject({ type: 'error', id: 1, message: 'database gone' });
    expect(port.sent[1]).toEqual({ type: 'result', id: 2, result: 0 });
  });

  it('accepts requests before the database connection is ready', async () => {
    let connect: (ops: ComputeOps) => void = () => undefined;
    const ops = new Promise<ComputeOps>((resolve) => (connect = resolve));
    const port = new FakePort();

    serveRequests(port as unknown as MessagePort, ops);
    port.emit('message', { id: 7, op: 'countUncoveredMissedBreaks', args: {} });
    await settle();
    expect(port.sent).toEqual([]);

    connect({ countUncoveredMissedBreaks: async () => 5 } as unknown as ComputeOps);
    await settle();
    expect(port.sent).toEqual([{ type: 'result', id: 7, result: 5 }]);
  });
});
