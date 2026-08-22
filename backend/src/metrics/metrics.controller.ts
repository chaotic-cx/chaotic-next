import {
  type LiveRouterRps,
  LIVE_RPS_SSE_EVENT,
  type LiveTrafficHit,
  type RpsHistorySample,
} from '@chaotic-next/shared-lib';
import { Controller, Get, Param, Query, Sse } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Observable } from 'rxjs';
import {
  CountNameDto,
  LiveTrafficHitDto,
  MetricsQueryDto,
  RpsHistorySampleDto,
  SpecificPackageMetricsDto,
  UserAgentMetricDto,
} from './metrics.dto';
import { MetricsService } from './metrics.service';

@ApiTags('metrics')
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('users')
  @ApiOperation({ summary: 'Get unique user count for a given number of days.' })
  @ApiOkResponse({ description: 'User count', type: Number })
  users(@Query() query: MetricsQueryDto): Promise<number> {
    return this.metricsService.uniqueUsers(query.days);
  }

  @Get('user-agents')
  @ApiOperation({ summary: 'Get user agent statistics for a given number of days.' })
  @ApiOkResponse({ description: 'User agent stats', type: UserAgentMetricDto, isArray: true })
  userAgents(@Query() query: MetricsQueryDto): Promise<UserAgentMetricDto[]> {
    return this.metricsService.uniqueUserAgents(query.days);
  }

  @Get('package/:package')
  @ApiOperation({ summary: 'Get download and user agent stats for a specific package over a given number of days.' })
  @ApiParam({ name: 'package', description: 'Package name to get metrics for', required: true })
  @ApiOkResponse({ description: 'Metrics for a specific package', type: SpecificPackageMetricsDto })
  package(@Param('package') pkg: string, @Query() query: MetricsQueryDto): Promise<SpecificPackageMetricsDto> {
    return this.metricsService.packageMetrics(pkg, query.days);
  }

  @Get('rank/:range/countries')
  @ApiOperation({ summary: 'Get country ranking for a given range over a given number of days.' })
  @ApiParam({ name: 'range', description: 'Range (e.g. top 10)', required: true })
  @ApiOkResponse({ description: 'Country rank list', type: CountNameDto, isArray: true })
  rankCountries(@Param('range') range: string, @Query() query: MetricsQueryDto): Promise<CountNameDto[]> {
    return this.metricsService.rankCountries(range, query.days);
  }

  @Get('rank/:range/packages')
  @ApiOperation({ summary: 'Get package ranking for a given range over a given number of days.' })
  @ApiParam({ name: 'range', description: 'Range (e.g. top 10)', required: true })
  @ApiOkResponse({ description: 'Package rank list', type: CountNameDto, isArray: true })
  rankPackages(@Param('range') range: string, @Query() query: MetricsQueryDto): Promise<CountNameDto[]> {
    return this.metricsService.rankPackages(range, query.days);
  }

  @Get('rps/history')
  @ApiOperation({ summary: 'Get the router requests-per-second samples of the last hour.' })
  @ApiOkResponse({ description: 'Per-second RPS samples', type: RpsHistorySampleDto, isArray: true })
  rpsHistory(): Promise<RpsHistorySample[]> {
    return this.metricsService.getRpsHistory();
  }

  @Sse('live/traffic')
  @SkipThrottle()
  @ApiOperation({
    summary: 'Stream real-time ALPM/pacman router traffic and router RPS as SSE JSON events.',
    description:
      'Emits a continuous Server-Sent Events (SSE) stream of default "message" events with JSON LiveTrafficHitDto ' +
      `payloads parsed from live router pings, plus "${LIVE_RPS_SSE_EVENT}" events carrying the router's real requests-per-second count.`,
  })
  @ApiOkResponse({
    description: 'Server-sent events stream of live traffic hits',
    type: LiveTrafficHitDto,
  })
  liveTraffic(): Observable<Partial<MessageEvent<LiveTrafficHit | LiveRouterRps>>> {
    return this.metricsService.getLiveTrafficStream();
  }
}
