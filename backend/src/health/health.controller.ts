import { schemaResponse } from '../api/response-schema';
import { DbHealthIndicator } from './db.health';
import { type HealthCheckResult, type HealthIndicatorResult } from './health.types';
import { RedisHealthIndicator } from './redis.health';
import { healthCheckResultSchema } from '@chaotic-next/shared-lib';
import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';

/** Liveness fails when RSS exceeds this. */
const MEMORY_RSS_LIMIT_BYTES = 1024 * 2 ** 20; /* 1024 MB */

class VersionDto {
  @ApiProperty({ description: 'Application version' }) version!: string;
}

type HealthCheck = { key: string; run: () => Promise<HealthIndicatorResult> };

function checkRss(key: string): HealthIndicatorResult {
  const rss = process.memoryUsage().rss;
  if (rss > MEMORY_RSS_LIMIT_BYTES) {
    throw new Error(`RSS memory usage exceeds the limit (${rss} > ${MEMORY_RSS_LIMIT_BYTES} bytes)`);
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
  @ApiOperation({ summary: 'Liveness: process up, DB reachable, memory sane.' })
  @ApiOkResponse({ description: 'Health check result', schema: schemaResponse(healthCheckResultSchema).schema })
  async check(): Promise<HealthCheckResult> {
    const result = await this.runChecks([
      { key: 'db', run: () => this.db.pingCheck('db') },
      { key: 'mem_rss', run: async () => checkRss('mem_rss') },
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
