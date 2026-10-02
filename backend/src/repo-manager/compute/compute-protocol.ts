import { type ComputeLogger } from './compute-logger';
import { type ComputeOpName } from './compute-ops';

// Other threads that import the worker module must not start it.
export const COMPUTE_WORKER_ROLE = 'signal-compute';

export type LogLevel = keyof ComputeLogger;

export interface ComputeRequestMessage {
  id: number;
  op: ComputeOpName;
  args: unknown;
}

export type ComputeWorkerMessage =
  | { type: 'ready' }
  | { type: 'result'; id: number; result: unknown }
  | { type: 'error'; id: number; message: string; stack?: string }
  | { type: 'log'; level: LogLevel; obj: unknown; msg?: string };
