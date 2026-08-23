import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import type { HealthCheckResult } from '@nestjs/terminus';
import { HealthCheck, HealthCheckService, MemoryHealthIndicator, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { RedisHealthIndicator } from './redis.health';
import { HealthCheckResultDto } from './health.dto';

class VersionDto {
  @ApiProperty({ description: 'Application version' }) version!: string;
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private orm: TypeOrmHealthIndicator,
    private memory: MemoryHealthIndicator,
    private redis: RedisHealthIndicator,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Liveness: process up, DB reachable, memory sane.' })
  @ApiOkResponse({ description: 'Health check result', type: HealthCheckResultDto })
  @HealthCheck()
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.orm.pingCheck('db'),
      () => this.memory.checkRSS('mem_rss', 1024 * 2 ** 20 /* 1024 MB */),
    ]);
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness: DB and Redis are reachable.' })
  @ApiOkResponse({ description: 'Readiness check result', type: HealthCheckResultDto })
  @HealthCheck()
  ready(): Promise<HealthCheckResult> {
    return this.health.check([() => this.orm.pingCheck('db'), () => this.redis.pingCheck('redis')]);
  }

  @Get('version')
  @ApiOperation({ summary: 'Application version.' })
  @ApiOkResponse({ description: 'Version info', type: VersionDto })
  getVersion(): VersionDto {
    return { version: __VERSION__ };
  }
}
