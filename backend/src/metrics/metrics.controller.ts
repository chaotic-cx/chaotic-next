import { schemaResponse, schemaResponseArray } from '../api/response-schema';
import { MetricsService } from './metrics.service';
import {
  countNameObjectSchema,
  LIVE_RPS_SSE_EVENT,
  liveTrafficHitSchema,
  metricsQuerySchema,
  rpsHistorySampleSchema,
  specificPackageMetricsSchema,
  type CountNameObject,
  type LiveRouterRps,
  type LiveTrafficHit,
  type MetricsQueryDto,
  type RpsHistorySample,
  type SpecificPackageMetrics,
  type UserAgentMetric,
  userAgentMetricSchema,
} from '@chaotic-next/shared-lib';
import { Controller, Get, Param, Query, Sse } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { type Observable } from 'rxjs';

@ApiTags('metrics')
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('users')
  @ApiOperation({ summary: 'Get unique user count for a given number of days.' })
  @ApiOkResponse({ description: 'User count', type: Number })
  users(@Query({ schema: metricsQuerySchema }) query: MetricsQueryDto): Promise<number> {
    return this.metricsService.uniqueUsers(query.days);
  }

  @Get('user-agents')
  @ApiOperation({ summary: 'Get user agent statistics for a given number of days.' })
  @ApiOkResponse({ description: 'User agent stats', schema: schemaResponseArray(userAgentMetricSchema).schema })
  userAgents(@Query({ schema: metricsQuerySchema }) query: MetricsQueryDto): Promise<UserAgentMetric[]> {
    return this.metricsService.uniqueUserAgents(query.days, query.repo);
  }

  @Get('package/:package')
  @ApiOperation({ summary: 'Get download and user agent stats for a specific package over a given number of days.' })
  @ApiParam({ name: 'package', description: 'Package name to get metrics for', required: true })
  @ApiOkResponse({
    description: 'Metrics for a specific package',
    schema: schemaResponse(specificPackageMetricsSchema).schema,
  })
  package(
    @Param('package') pkg: string,
    @Query({ schema: metricsQuerySchema }) query: MetricsQueryDto,
  ): Promise<SpecificPackageMetrics> {
    return this.metricsService.packageMetrics(pkg, query.days);
  }

  @Get('rank/:range/countries')
  @ApiOperation({ summary: 'Get country ranking for a given range over a given number of days.' })
  @ApiParam({ name: 'range', description: 'Range (e.g. top 10)', required: true })
  @ApiOkResponse({ description: 'Country rank list', schema: schemaResponseArray(countNameObjectSchema).schema })
  rankCountries(
    @Param('range') range: string,
    @Query({ schema: metricsQuerySchema }) query: MetricsQueryDto,
  ): Promise<CountNameObject[]> {
    return this.metricsService.rankCountries(range, query.days, query.repo);
  }

  @Get('rank/:range/packages')
  @ApiOperation({ summary: 'Get package ranking for a given range over a given number of days.' })
  @ApiParam({ name: 'range', description: 'Range (e.g. top 10)', required: true })
  @ApiOkResponse({ description: 'Package rank list', schema: schemaResponseArray(countNameObjectSchema).schema })
  rankPackages(
    @Param('range') range: string,
    @Query({ schema: metricsQuerySchema }) query: MetricsQueryDto,
  ): Promise<CountNameObject[]> {
    return this.metricsService.rankPackages(range, query.days, query.repo);
  }

  @Get('rps/history')
  @ApiOperation({ summary: 'Get the router requests-per-second samples of the last hour.' })
  @ApiOkResponse({ description: 'Per-second RPS samples', schema: schemaResponseArray(rpsHistorySampleSchema).schema })
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
    schema: schemaResponseArray(liveTrafficHitSchema).schema,
  })
  liveTraffic(): Observable<Partial<MessageEvent<LiveTrafficHit | LiveRouterRps>>> {
    return this.metricsService.getLiveTrafficStream();
  }
}
