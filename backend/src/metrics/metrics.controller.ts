import { CacheInterceptor } from '@nestjs/cache-manager';
import { Controller, Get, Param, Query, UseInterceptors } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CountNameDto, MetricsQueryDto, SpecificPackageMetricsDto, UserAgentMetricDto } from './metrics.dto';
import { MetricsService } from './metrics.service';

@ApiTags('metrics')
@Controller('metrics')
@UseInterceptors(CacheInterceptor)
export class MetricsController {
  constructor(private metricsService: MetricsService) {}

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
}
