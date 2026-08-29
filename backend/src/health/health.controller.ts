import { schemaResponse } from '../api/response-schema';
import { DbHealthIndicator } from './db.health';
import { type HealthCheckResult, type HealthIndicatorResult } from './health.types';
import { RedisHealthIndicator } from './redis.health';
import { healthCheckResultSchema } from '@chaotic-next/shared-lib';
import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { getHeapStatistics } from 'node:v8';

/** Liveness fails when used heap exceeds this share of the configured heap limit. */
const HEAP_PRESSURE_LIMIT_RATIO = 0.9;

class VersionDto {
  @ApiProperty({ description: 'Application version' }) version!: string;
}

type HealthCheck = { key: string; run: () => Promise<HealthIndicatorResult> };

function checkHeap(key: string): HealthIndicatorResult {
  const { heap_size_limit: limit, used_heap_size: used } = getHeapStatistics();
  if (used > limit * HEAP_PRESSURE_LIMIT_RATIO) {
    throw new Error(`Heap usage exceeds ${HEAP_PRESSURE_LIMIT_RATIO * 100}% of the limit (${used} > ${limit} bytes)`);
  }
  return { [key]: { status: 'up' } };
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private db: DbHealthIndicator,
    private redis: RedisHealthIndicator,
  ) {}

  private async runChecks(checks: HealthCheck[]): Promise<HealthCheckResult> {
    const info: HealthCheckResult['info'] = {};
    const error: HealthCheckResult['error'] = {};
    const details: HealthCheckResult['details'] = {};

    await Promise.all(
      checks.map(async ({ key, run }) => {
        try {
          const result = await run();
          details[key] = result[key];
          info[key] = { status: 'up' };
        } catch (err) {
          // Failed indicators throw with their partial result attached; fall
          // back to a bare marker when the error carries no result at all.
          const result = (err instanceof Error && 'result' in err
            ? (err as { result: HealthIndicatorResult }).result
            : undefined) ?? {
            [key]: { status: 'down' as const },
          };
          details[key] = result[key];
          error[key] = { status: 'down', message: result[key]?.message };
        }
      }),
    );

    return {
      status: Object.keys(error).length === 0 ? 'ok' : 'error',
      info,
      error,
      details,
    };
  }

  @Get()
  @ApiOperation({ summary: 'Liveness: process up, DB reachable, heap pressure sane.' })
  @ApiOkResponse({ description: 'Health check result', schema: schemaResponse(healthCheckResultSchema).schema })
  async check(): Promise<HealthCheckResult> {
    const result = await this.runChecks([
      { key: 'db', run: () => this.db.pingCheck('db') },
      { key: 'heap', run: async () => checkHeap('heap') },
    ]);
    if (result.status === 'error') {
      throw new HttpException(result, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return result;
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness: DB and Redis are reachable.' })
  @ApiOkResponse({ description: 'Readiness check result', schema: schemaResponse(healthCheckResultSchema).schema })
  async ready(): Promise<HealthCheckResult> {
    const result = await this.runChecks([
      { key: 'db', run: () => this.db.pingCheck('db') },
      { key: 'redis', run: () => this.redis.pingCheck('redis') },
    ]);
    if (result.status === 'error') {
      throw new HttpException(result, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return result;
  }

  @Get('version')
  @ApiOperation({ summary: 'Application version.' })
  @ApiOkResponse({ description: 'Version info', type: VersionDto })
  getVersion(): VersionDto {
    return { version: __VERSION__ };
  }
}
