import { parentPort, workerData, type MessagePort } from 'node:worker_threads';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { Package } from '../../builder/builder.entity';
import { dataSourceOptions } from '../../data/data.source';
import { ArchlinuxPackage, PackageElfAnalysis } from '../repo-manager.entity';
import { type ComputeLogger } from './compute-logger';
import { type ComputeOps, createComputeOps } from './compute-ops';
import {
  COMPUTE_WORKER_ROLE,
  type ComputeRequestMessage,
  type ComputeWorkerMessage,
  type LogLevel,
} from './compute-protocol';

// The worker runs one operation at a time, so it needs few connections.
const WORKER_POOL_MAX = 4;

function send(port: MessagePort, message: ComputeWorkerMessage): void {
  port.postMessage(message);
}

/**
 * A log value that cannot be cloned is sent as a string.
 * A log call must never fail the computation.
 */
function sendLog(port: MessagePort, level: LogLevel, obj: unknown, msg?: string): void {
  try {
    send(port, { type: 'log', level, obj, msg });
  } catch {
    send(port, { type: 'log', level, obj: String(obj), msg });
  }
}

function forwardingLogger(port: MessagePort): ComputeLogger {
  return {
    info: (obj, msg) => sendLog(port, 'info', obj, msg),
    debug: (obj, msg) => sendLog(port, 'debug', obj, msg),
    warn: (obj, msg) => sendLog(port, 'warn', obj, msg),
    error: (obj, msg) => sendLog(port, 'error', obj, msg),
  };
}

async function openDataSource(): Promise<DataSource> {
  const entities = Array.isArray(dataSourceOptions.entities) ? dataSourceOptions.entities : [];
  const poolOptions = { ...(dataSourceOptions.extra as object), max: WORKER_POOL_MAX, min: 0 };

  const options = {
    ...dataSourceOptions,
    // The app loads Package through autoLoadEntities, which this connection does not have.
    entities: [...entities, Package],
    migrationsRun: false,
    cache: false,
    extra: poolOptions,
  } as DataSourceOptions;

  const dataSource = new DataSource(options);

  return dataSource.initialize();
}

async function handleRequest(
  port: MessagePort,
  ops: Promise<ComputeOps>,
  request: ComputeRequestMessage,
): Promise<void> {
  try {
    const computeOps = await ops;
    const operation = computeOps[request.op] as (args: unknown) => Promise<unknown>;
    const result = await operation(request.args);

    send(port, { type: 'result', id: request.id, result });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));

    send(port, { type: 'error', id: request.id, message: error.message, stack: error.stack });
  }
}

/**
 * Runs one request at a time.
 * The directory index is state of the worker, and only one large computation fits in memory.
 */
export function serveRequests(port: MessagePort, ops: Promise<ComputeOps>): void {
  let queue: Promise<void> = Promise.resolve();

  port.on('message', (request: ComputeRequestMessage) => {
    queue = queue.then(() => handleRequest(port, ops, request));
  });
}

async function connect(logger: ComputeLogger): Promise<ComputeOps> {
  const dataSource = await openDataSource();

  const repositories = {
    analyses: dataSource.getRepository(PackageElfAnalysis),
    archPackages: dataSource.getRepository(ArchlinuxPackage),
    packages: dataSource.getRepository(Package),
  };

  return createComputeOps(repositories, logger);
}

function startWorker(port: MessagePort): void {
  const logger = forwardingLogger(port);
  const ops = connect(logger);

  // Listen at once, so that no request arrives before the handler exists.
  serveRequests(port, ops);

  ops.then(
    () => send(port, { type: 'ready' }),
    (err: unknown) => {
      logger.error({ err }, 'Compute worker could not connect to the database');
      process.exit(1);
    },
  );
}

const workerRole = (workerData as { role?: string } | null)?.role;
if (parentPort && workerRole === COMPUTE_WORKER_ROLE) {
  startWorker(parentPort);
}
