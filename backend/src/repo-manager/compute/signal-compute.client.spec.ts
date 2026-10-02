import { EventEmitter } from 'node:events';
import { type Worker } from 'node:worker_threads';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type ComputeRepositories } from './compute-ops';
import * as computeOps from './compute-ops';
import { type ComputeRequestMessage } from './compute-protocol';
import { SignalComputeClient } from './signal-compute.client';

class FakeWorker extends EventEmitter {
  readonly requests: ComputeRequestMessage[] = [];
  postMessage(request: ComputeRequestMessage): void {
    this.requests.push(request);
  }
  unref(): this {
    return this;
  }
  async terminate(): Promise<number> {
    return 0;
  }
}

const logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };

function workerClient(): { client: SignalComputeClient; workers: FakeWorker[] } {
  const client = new SignalComputeClient({} as never, {} as never, {} as never, logger as never);
  const workers: FakeWorker[] = [];
  const internals = client as unknown as { workerUnavailable: boolean; spawnWorker: () => Worker };
  internals.workerUnavailable = false;
  const spawn = (): Worker => {
    const worker = new FakeWorker();
    workers.push(worker);
    worker.on('message', (message) =>
      (client as unknown as { handleMessage(m: unknown): void }).handleMessage(message),
    );
    worker.on('error', (err) =>
      (client as unknown as { handleWorkerFailure(w: unknown, e: unknown): void }).handleWorkerFailure(worker, err),
    );
    return worker as unknown as Worker;
  };
  internals.spawnWorker = spawn;
  return { client, workers };
}

function inlineOps(): void {
  vi.spyOn(computeOps, 'createComputeOps').mockReturnValue({
    countUncoveredMissedBreaks: async () => 42,
  } as unknown as computeOps.ComputeOps);
}

describe('SignalComputeClient', () => {
  afterEach(() => vi.restoreAllMocks());

  it('runs the operations inline when the client is inline', async () => {
    inlineOps();
    const client = SignalComputeClient.inline({} as ComputeRepositories, logger);

    await expect(client.run('countUncoveredMissedBreaks', {})).resolves.toBe(42);
  });

  it('sends a call to the worker and resolves it with the result', async () => {
    const { client, workers } = workerClient();

    const call = client.run('countUncoveredMissedBreaks', {});
    const [request] = workers[0].requests;
    workers[0].emit('message', { type: 'ready' });
    workers[0].emit('message', { type: 'result', id: request.id, result: 7 });

    await expect(call).resolves.toBe(7);
    expect(request.op).toBe('countUncoveredMissedBreaks');
  });

  it('rejects a call with the error of the worker', async () => {
    const { client, workers } = workerClient();

    const call = client.run('rebuildCoverage', {});
    workers[0].emit('message', { type: 'error', id: workers[0].requests[0].id, message: 'database gone' });

    await expect(call).rejects.toThrow('database gone');
  });

  it('writes the log calls of the worker with the client logger', () => {
    const { client, workers } = workerClient();
    void client.run('countUncoveredMissedBreaks', {});

    workers[0].emit('message', { type: 'log', level: 'warn', obj: { pkgname: 'x' }, msg: 'from worker' });

    expect(logger.warn).toHaveBeenCalledWith({ pkgname: 'x' }, 'from worker');
  });

  it('runs the open calls inline when the worker fails before it is ready', async () => {
    inlineOps();
    const { client, workers } = workerClient();

    const call = client.run('countUncoveredMissedBreaks', {});
    workers[0].emit('error', new Error('cannot load chunk'));

    await expect(call).resolves.toBe(42);
    await expect(client.run('countUncoveredMissedBreaks', {})).resolves.toBe(42);
    expect(workers).toHaveLength(1);
  });

  it('fails the open calls when a ready worker crashes, and starts a new worker for the next call', async () => {
    const { client, workers } = workerClient();
    workers.length = 0;
    const first = client.run('countUncoveredMissedBreaks', {});
    workers[0].emit('message', { type: 'ready' });

    const call = client.run('rebuildCoverage', {});
    workers[0].emit('error', new Error('out of memory'));
    await expect(first).rejects.toThrow('out of memory');
    await expect(call).rejects.toThrow('out of memory');

    void client.run('countUncoveredMissedBreaks', {});
    expect(workers).toHaveLength(2);
  });
});
