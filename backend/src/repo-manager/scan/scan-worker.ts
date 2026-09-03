import { parentPort, Worker, type WorkerOptions } from 'node:worker_threads';
import { scanArchive } from '../offline/scan-archive';
import { buildAnalysis } from '../signal/plugin';

export interface ScanWorkerInput {
  file: string;
  version: string;
}

export interface ScanOutcome {
  result: ReturnType<typeof buildAnalysis> | null;
  warnings: string[];
}

interface ScanRequest {
  id: number;
  file: string;
  version: string;
}

interface ScanResponse {
  id: number;
  result?: ReturnType<typeof buildAnalysis> | null;
  warnings?: string[];
  error?: string;
}

interface PendingTask {
  input: ScanWorkerInput;
  resolve: (outcome: ScanOutcome) => void;
  reject: (err: unknown) => void;
}

const MAX_WORKERS = 4;

let pool: Worker[] | null = null;
let workersSupported = true;
let nextWorker = 0;
let nextTaskId = 0;
const pendingById = new Map<number, PendingTask>();
const taskIdsByWorker = new Map<Worker, Set<number>>();

async function scanInline(input: ScanWorkerInput): Promise<ScanOutcome> {
  const scanned = await scanArchive(input.file);
  if (!scanned) return { result: null, warnings: [] };
  return { result: buildAnalysis({ version: input.version, ...scanned }), warnings: scanned.warnings };
}

/**
 * Re-runs the broken worker's in-flight tasks on the main thread and disables
 * workers for the rest of the process. Used when a worker fails to load (the
 * worker chunk only exists in the rspack bundle, not in raw TS under vitest or
 * ts-node) or crashes, so scans still complete either way.
 */
function degradeToInline(worker: Worker): void {
  workersSupported = false;
  const taskIds = taskIdsByWorker.get(worker) ?? new Set<number>();
  taskIdsByWorker.delete(worker);
  for (const id of taskIds) {
    const task = pendingById.get(id);
    if (!task) continue;
    pendingById.delete(id);
    void scanInline(task.input).then(task.resolve, task.reject);
  }
  if (pool) {
    for (const w of pool) void w.terminate();
    pool = null;
  }
}

function spawnWorker(): Worker {
  const worker = new Worker(new URL('./scan-worker.ts', import.meta.url), { type: 'module' } as WorkerOptions);
  // Idle workers must not keep scripts or the server from exiting cleanly.
  worker.unref();
  worker.on('message', (response: ScanResponse) => {
    const task = pendingById.get(response.id);
    if (!task) return;
    pendingById.delete(response.id);
    taskIdsByWorker.get(worker)?.delete(response.id);
    if (response.error) task.reject(new Error(response.error));
    else task.resolve({ result: response.result ?? null, warnings: response.warnings ?? [] });
  });
  worker.on('error', () => degradeToInline(worker));
  worker.on('exit', (code) => {
    if (code !== 0) degradeToInline(worker);
  });
  return worker;
}

function getPool(): Worker[] | null {
  if (pool) return pool;
  if (!workersSupported || process.env.VITEST === 'true') return null;
  pool = [];
  for (let i = 0; i < MAX_WORKERS; i++) {
    try {
      const worker = spawnWorker();
      pool.push(worker);
      taskIdsByWorker.set(worker, new Set());
    } catch {
      pool = null;
      return null;
    }
  }
  return pool;
}

export async function scanPackageInWorker(input: ScanWorkerInput): Promise<ScanOutcome> {
  const workers = getPool();
  if (!workers) return scanInline(input);

  return new Promise<ScanOutcome>((resolve, reject) => {
    const id = nextTaskId++;
    pendingById.set(id, { input, resolve, reject });
    const worker = workers[nextWorker++ % workers.length];
    taskIdsByWorker.get(worker)?.add(id);
    try {
      worker.postMessage({ id, file: input.file, version: input.version } satisfies ScanRequest);
    } catch {
      pendingById.delete(id);
      taskIdsByWorker.get(worker)?.delete(id);
      void scanInline(input).then(resolve, reject);
    }
  });
}

const port = parentPort;
if (port) {
  port.on('message', async (request: ScanRequest) => {
    try {
      const scanned = await scanArchive(request.file);
      const response: ScanResponse = {
        id: request.id,
        result: scanned ? buildAnalysis({ version: request.version, ...scanned }) : null,
        warnings: scanned?.warnings ?? [],
      };
      port.postMessage(response);
    } catch (err) {
      port.postMessage({ id: request.id, error: err instanceof Error ? err.message : String(err) });
    }
  });
}
