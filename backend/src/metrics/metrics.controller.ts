import { CacheInterceptor } from '@nestjs/cache-manager';
import { Controller, Get, Param, ParseIntPipe, Query, UseInterceptors } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { ApiOkResponse, ApiOperation, ApiParam, ApiProperty, ApiQuery, ApiTags } from '@nestjs/swagger';

class UserAgentMetricDto {
  @ApiProperty()
  name!: string;

  @ApiProperty()
  count!: number;
}

class CountNameDto {
  @ApiProperty()
  name!: string;

  @ApiProperty()
  count!: number;
}

class SpecificPackageMetricsDto {
  @ApiProperty({ required: false })
  name?: string;

  @ApiProperty()
  downloads!: number;

  @ApiProperty({ type: UserAgentMetricDto, isArray: true })
  user_agents!: UserAgentMetricDto[];
}

@ApiTags('metrics')
@Controller('metrics')
@UseInterceptors(CacheInterceptor)
export class MetricsController {
  constructor(private metricsService: MetricsService) {}

  @Get('users')
  @ApiOperation({ summary: 'Get unique user count for a given number of days.' })
  @ApiQuery({ name: 'days', required: false, description: 'Number of days to look back', type: Number })
  @ApiOkResponse({ description: 'User count', type: Number })
  users(@Query('days', new ParseIntPipe({ optional: true })) days?: number): Promise<number> {
    return this.metricsService.uniqueUsers(days);
  }

  @Get('user-agents')
  @ApiOperation({ summary: 'Get user agent statistics for a given number of days.' })
  @ApiQuery({ name: 'days', required: false, description: 'Number of days to look back', type: Number })
  @ApiOkResponse({ description: 'User agent stats', type: UserAgentMetricDto, isArray: true })
  userAgents(@Query('days', new ParseIntPipe({ optional: true })) days?: number): Promise<UserAgentMetricDto[]> {
    return this.metricsService.uniqueUserAgents(days);
  }

  @Get('package/:package')
  @ApiOperation({ summary: 'Get download and user agent stats for a specific package over a given number of days.' })
  @ApiParam({ name: 'package', description: 'Package name to get metrics for', required: true })
  @ApiQuery({ name: 'days', required: false, description: 'Number of days to look back', type: Number })
  @ApiOkResponse({ description: 'Metrics for a specific package', type: SpecificPackageMetricsDto })
  package(
    @Param('package') pkg: string,
    @Query('days', new ParseIntPipe({ optional: true })) days?: number,
  ): Promise<SpecificPackageMetricsDto> {
    return this.metricsService.packageMetrics(pkg, days);
  }

  @Get('rank/:range/countries')
  @ApiOperation({ summary: 'Get country ranking for a given range over a given number of days.' })
  @ApiParam({ name: 'range', description: 'Range (e.g. top 10)', required: true })
  @ApiQuery({ name: 'days', required: false, description: 'Number of days to look back', type: Number })
  @ApiOkResponse({ description: 'Country rank list', type: CountNameDto, isArray: true })
  rankCountries(
    @Param('range') range: string,
    @Query('days', new ParseIntPipe({ optional: true })) days?: number,
  ): Promise<CountNameDto[]> {
    return this.metricsService.rankCountries(range, days);
  }

  @Get('rank/:range/packages')
  @ApiOperation({ summary: 'Get package ranking for a given range over a given number of days.' })
  @ApiParam({ name: 'range', description: 'Range (e.g. top 10)', required: true })
  @ApiQuery({ name: 'days', required: false, description: 'Number of days to look back', type: Number })
  @ApiOkResponse({ description: 'Package rank list', type: CountNameDto, isArray: true })
  rankPackages(
    @Param('range') range: string,
    @Query('days', new ParseIntPipe({ optional: true })) days?: number,
  ): Promise<CountNameDto[]> {
    return this.metricsService.rankPackages(range, days);
  }
}
