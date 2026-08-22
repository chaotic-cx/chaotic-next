import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CountryStatsDto, MirrorStatsDto, PackageStatsDto, PerDayStatsDto } from './router.dto';
import { RouterService } from './router.service';

@ApiTags('router')
@Controller('router')
export class RouterController {
  constructor(private routerService: RouterService) {}

  @Get('/country/:days')
  @ApiOperation({ summary: 'Get router country stats.' })
  @ApiParam({ name: 'days', description: 'Number of days' })
  @ApiOkResponse({ description: 'Country stats', type: CountryStatsDto, isArray: true })
  async getRouterStatsDefault(@Param('days', ParseIntPipe) days: number): Promise<CountryStatsDto[]> {
    return this.routerService.getCountryStats(days);
  }

  @Get('/mirror/:days')
  @ApiOperation({ summary: 'Get router mirror stats.' })
  @ApiParam({ name: 'days', description: 'Number of days' })
  @ApiOkResponse({ description: 'Mirror stats', type: MirrorStatsDto, isArray: true })
  async getRouterStatsMirror(@Param('days', ParseIntPipe) days: number): Promise<MirrorStatsDto[]> {
    return this.routerService.getMirrorStats(days);
  }

  @Get('stats/mirror-over-time/:days')
  @ApiOperation({ summary: 'Get mirror downloads over time' })
  @ApiParam({ name: 'days', description: 'Number of days' })
  @ApiOkResponse({ description: 'Mirror downloads over time', type: Object, isArray: true })
  async getRouterStatsMirrorOverTime(
    @Param('days', ParseIntPipe) days: number,
  ): Promise<{ day: string; mirror: string; count: string }[]> {
    return this.routerService.getMirrorStatsOverTime(days);
  }

  @Get('stats/country-over-time/:days')
  @ApiOperation({ summary: 'Get country downloads over time' })
  @ApiParam({ name: 'days', description: 'Number of days' })
  @ApiOkResponse({ description: 'Country downloads over time', type: Object, isArray: true })
  async getRouterStatsCountryOverTime(
    @Param('days', ParseIntPipe) days: number,
  ): Promise<{ day: string; country: string; count: string }[]> {
    return this.routerService.getCountryStatsOverTime(days);
  }

  @Get('/package/:days')
  @ApiOperation({ summary: 'Get router package stats.' })
  @ApiParam({ name: 'days', description: 'Number of days' })
  @ApiOkResponse({ description: 'Package stats', type: PackageStatsDto, isArray: true })
  async getRouterStatsPackage(@Param('days', ParseIntPipe) days: number): Promise<PackageStatsDto[]> {
    return this.routerService.getPackageStats(days);
  }

  @Get('/per-day/:days')
  @ApiOperation({ summary: 'Get router stats per day.' })
  @ApiParam({ name: 'days', description: 'Number of days' })
  @ApiOkResponse({ description: 'Stats per day', type: PerDayStatsDto, isArray: true })
  async getRouterStatsPerDay(@Param('days', ParseIntPipe) days: number): Promise<PerDayStatsDto[]> {
    return this.routerService.getPerDayStats(days);
  }

  @Get('/useragents/trend/:days')
  @ApiOperation({ summary: 'Get download counts per day for the top user agents.' })
  @ApiParam({ name: 'days', description: 'Number of days' })
  @ApiOkResponse({ description: 'User-agent download trend', type: Object, isArray: true })
  async getUserAgentTrend(
    @Param('days', ParseIntPipe) days: number,
  ): Promise<{ day: string; userAgent: string; count: string }[]> {
    return this.routerService.getUserAgentTrend(days);
  }
}
