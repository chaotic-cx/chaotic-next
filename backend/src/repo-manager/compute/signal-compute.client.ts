import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Worker, type WorkerOptions } from 'node:worker_threads';
import { Repository } from 'typeorm';
import { Package } from '../../builder/builder.entity';
import { ArchlinuxPackage, PackageElfAnalysis } from '../repo-manager.entity';
import { type ComputeLogger } from './compute-logger';
import {
  type ComputeArgs,
  type ComputeOpName,
  type ComputeOps,
  type ComputeRepositories,
  type ComputeResult,
  createComputeOps,
} from './compute-ops';
import { COMPUTE_WORKER_ROLE, type ComputeRequestMessage, type ComputeWorkerMessage } from './compute-protocol';

interface PendingCall {
  op: ComputeOpName;
  args: unknown;
  resolve: (result: unknown) => void;
  reject: (err: unknown) => void;
}

// Runs the signal computations in a worker thread. On the main thread they blocked requests for seconds.
@Injectable()
export class SignalComputeClient implements OnModuleDestroy {
  private worker: Worker | null = null;
  private workerReady = false;
  private workerUnavailable = process.env.VITEST === 'true';
  private inlineOps: ComputeOps | null = null;
  private readonly pending = new Map<number, PendingCall>();
  private nextCallId = 0;

  constructor(
    @InjectRepository(PackageElfAnalysis)
    private readonly analysisRepository: Repository<PackageElfAnalysis>,
    @InjectRepository(ArchlinuxPackage)
    private readonly archlinuxPackageRepository: Repository<ArchlinuxPackage>,
    @InjectRepository(Package)
    private readonly packageRepository: Repository<Package>,
    @InjectPinoLogger(SignalComputeClient.name) private readonly pino: PinoLogger,
  ) {}

  static inline(repos: ComputeRepositories, logger: ComputeLogger): SignalComputeClient {
    const client = new SignalComputeClient(
      repos.analyses,
      repos.archPackages,
      repos.packages,
      logger as unknown as PinoLogger,
    );
    client.workerUnavailable = true;
    return client;
  }

  run<K extends ComputeOpName>(op: K, args: ComputeArgs<K>): Promise<ComputeResult<K>> {
    const worker = this.ensureWorker();
    if (!worker) return this.runInline(op, args);

    return new Promise<ComputeResult<K>>((resolve, reject) => {
      const id = this.nextCallId++;
      this.pending.set(id, { op, args, resolve: resolve as (result: unknown) => void, reject });
      const request: ComputeRequestMessage = { id, op, args };
      worker.postMessage(request);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.terminate();
    this.worker = null;
  }

  private runInline<K extends ComputeOpName>(op: K, args: ComputeArgs<K>): Promise<ComputeResult<K>> {
    if (!this.inlineOps) {
      const repositories = {
        analyses: this.analysisRepository,
        archPackages: this.archlinuxPackageRepository,
        packages: this.packageRepository,
      };

      this.inlineOps = createComputeOps(repositories, this.pino);
    }

    const operation = this.inlineOps[op] as (input: ComputeArgs<K>) => Promise<ComputeResult<K>>;
    return operation(args);
  }

  private ensureWorker(): Worker | null {
    if (this.workerUnavailable) return null;

    if (this.worker) return this.worker;

    try {
      this.worker = this.spawnWorker();
    } catch (err: unknown) {
      this.pino.error({ err }, 'Cannot start the signal compute worker, computing on the main thread');
      this.workerUnavailable = true;
    }

    return this.worker;
  }

  private spawnWorker(): Worker {
    const worker = new Worker(new URL('./compute-worker.ts', import.meta.url), {
      type: 'module',
      workerData: { role: COMPUTE_WORKER_ROLE },
    } as WorkerOptions);
    // An idle worker must not keep scripts or the server from exiting.
    worker.unref();
    this.workerReady = false;
    worker.on('message', (message: ComputeWorkerMessage) => this.handleMessage(message));
    worker.on('error', (err: unknown) => this.handleWorkerFailure(worker, err));
    worker.on('exit', (code) => {
      if (code !== 0) {
        this.handleWorkerFailure(worker, new Error(`Signal compute worker exited with code ${code}`));
      }
    });

    return worker;
  }

  private handleMessage(message: ComputeWorkerMessage): void {
    if (message.type === 'ready') {
      this.workerReady = true;
      return;
    }

    if (message.type === 'log') {
      this.pino[message.level](message.obj, message.msg);
      return;
    }

    const call = this.pending.get(message.id);
    if (!call) return;

    this.pending.delete(message.id);

    if (message.type === 'result') {
      call.resolve(message.result);
    } else {
      const error = new Error(message.message);
      error.stack = message.stack;
      call.reject(error);
    }
  }

  /**
   * A worker that never got ready cannot load in this environment, so the
   * open calls run inline from now on. A crash of a ready worker fails the
   * open calls, and the next call starts a new worker.
   */
  private handleWorkerFailure(worker: Worker, err: unknown): void {
    if (this.worker !== worker) return;

    this.worker = null;
    const calls = [...this.pending.values()];
    this.pending.clear();

    if (!this.workerReady) {
      this.pino.error({ err }, 'Signal compute worker failed to start, computing on the main thread');
      this.workerUnavailable = true;

      for (const call of calls) {
        this.runInline(call.op, call.args as never).then(call.resolve, call.reject);
      }

      return;
    }

    this.pino.error({ err, failedCalls: calls.length }, 'Signal compute worker crashed');

    for (const call of calls) {
      call.reject(err);
    }
  }
}
