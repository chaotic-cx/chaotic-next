import { schemaResponseArray } from '../api/response-schema';
import { RouterService } from './router.service';
import {
  countryOverTimeSchema,
  countryStatsSchema,
  daysParamSchema,
  mirrorOverTimeSchema,
  mirrorStatsSchema,
  packageStatsSchema,
  perDayStatsSchema,
  repoQuerySchema,
  type CountryOverTime,
  type CountryStats,
  type MirrorOverTime,
  type MirrorStats,
  type PackageStats,
  type PerDayStats,
  type RepoQueryDto,
  type UserAgentTrend,
  userAgentTrendSchema,
} from '@chaotic-next/shared-lib';
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

@ApiTags('router')
@Controller('router')
export class RouterController {
  constructor(private routerService: RouterService) {}

  @Get('country/:days')
  @ApiOperation({ summary: 'Get router country stats.' })
  @ApiParam({ name: 'days', description: 'Number of days' })
  @ApiOkResponse({ description: 'Country stats', schema: schemaResponseArray(countryStatsSchema).schema })
  async getRouterStatsDefault(@Param('days', { schema: daysParamSchema }) days: number): Promise<CountryStats[]> {
    return this.routerService.getCountryStats(days);
  }

  @Get('mirror/:days')
  @ApiOperation({ summary: 'Get router mirror stats.' })
  @ApiParam({ name: 'days', description: 'Number of days' })
  @ApiOkResponse({ description: 'Mirror stats', schema: schemaResponseArray(mirrorStatsSchema).schema })
  async getRouterStatsMirror(@Param('days', { schema: daysParamSchema }) days: number): Promise<MirrorStats[]> {
    return this.routerService.getMirrorStats(days);
  }

  @Get('stats/mirror-over-time/:days')
  @ApiOperation({ summary: 'Get mirror downloads over time' })
  @ApiParam({ name: 'days', description: 'Number of days' })
  @ApiOkResponse({
    description: 'Mirror downloads over time',
    schema: schemaResponseArray(mirrorOverTimeSchema).schema,
  })
  async getRouterStatsMirrorOverTime(
    @Param('days', { schema: daysParamSchema }) days: number,
    @Query({ schema: repoQuerySchema }) query: RepoQueryDto,
  ): Promise<MirrorOverTime[]> {
    return this.routerService.getMirrorStatsOverTime(days, query.repo);
  }

  @Get('stats/country-over-time/:days')
  @ApiOperation({ summary: 'Get country downloads over time' })
  @ApiParam({ name: 'days', description: 'Number of days' })
  @ApiOkResponse({
    description: 'Country downloads over time',
    schema: schemaResponseArray(countryOverTimeSchema).schema,
  })
  async getRouterStatsCountryOverTime(
    @Param('days', { schema: daysParamSchema }) days: number,
    @Query({ schema: repoQuerySchema }) query: RepoQueryDto,
  ): Promise<CountryOverTime[]> {
    return this.routerService.getCountryStatsOverTime(days, query.repo);
  }

  @Get('package/:days')
  @ApiOperation({ summary: 'Get router package stats.' })
  @ApiParam({ name: 'days', description: 'Number of days' })
  @ApiOkResponse({ description: 'Package stats', schema: schemaResponseArray(packageStatsSchema).schema })
  async getRouterStatsPackage(@Param('days', { schema: daysParamSchema }) days: number): Promise<PackageStats[]> {
    return this.routerService.getPackageStats(days);
  }

  @Get('per-day/:days')
  @ApiOperation({ summary: 'Get router stats per day.' })
  @ApiParam({ name: 'days', description: 'Number of days' })
  @ApiOkResponse({ description: 'Stats per day', schema: schemaResponseArray(perDayStatsSchema).schema })
  async getRouterStatsPerDay(@Param('days', { schema: daysParamSchema }) days: number): Promise<PerDayStats[]> {
    return this.routerService.getPerDayStats(days);
  }

  @Get('useragents/trend/:days')
  @ApiOperation({ summary: 'Get download counts per day for the top user agents.' })
  @ApiParam({ name: 'days', description: 'Number of days' })
  @ApiOkResponse({ description: 'User-agent download trend', schema: schemaResponseArray(userAgentTrendSchema).schema })
  async getUserAgentTrend(
    @Param('days', { schema: daysParamSchema }) days: number,
    @Query({ schema: repoQuerySchema }) query: RepoQueryDto,
  ): Promise<UserAgentTrend[]> {
    return this.routerService.getUserAgentTrend(days, query.repo);
  }
}
