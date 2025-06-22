import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  type HealthCheckResult,
  type HealthCheckService,
  type MemoryHealthIndicator,
  type TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { ApiTags, ApiOkResponse, ApiOperation } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private orm: TypeOrmHealthIndicator,
    private memory: MemoryHealthIndicator,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get application health status including DB and memory.' })
  @ApiOkResponse({ description: 'Health check result', type: Object })
  @HealthCheck()
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.orm.pingCheck('db'),
      () => this.memory.checkRSS('mem_rss', 1024 * 2 ** 20 /* 1024 MB */),
    ]);
  }
}
