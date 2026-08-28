/**
 * Minimal health-check contracts, replacing `@nestjs/terminus` (whose v11 line
 * is incompatible with the NestJS 12 stack). The shapes match the terminus
 * response body the frontend and tests already consume.
 */
export type HealthIndicatorStatus = 'up' | 'down';

export interface HealthIndicatorResult {
  [key: string]: { status: HealthIndicatorStatus; message?: string };
}

export interface HealthCheckResult {
  status: 'ok' | 'error';
  info: Record<string, { status: HealthIndicatorStatus }>;
  error: Record<string, { status: HealthIndicatorStatus; message?: string }>;
  details: Record<string, { status: HealthIndicatorStatus; message?: string }>;
}

export class HealthCheckError extends Error {
  constructor(
    message: string,
    public readonly result: HealthIndicatorResult,
  ) {
    super(message);
  }
}
