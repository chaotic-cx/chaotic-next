import { Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse, ApiParam, ApiProperty } from '@nestjs/swagger';
import { RouterService } from './router.service';
import { AllowAnonymous } from '../auth/anonymous.decorator';

class CountryStatsDto {
  @ApiProperty()
  country: string;

  @ApiProperty()
  count: string;
}

class MirrorStatsDto {
  @ApiProperty()
  mirror: string;

  @ApiProperty()
  count: string;
}

class PackageStatsDto {
  @ApiProperty()
  pkgbase: string;

  @ApiProperty()
  count: string;
}

class PerDayStatsDto {
  @ApiProperty()
  day: string;

  @ApiProperty()
  count: string;
}

@ApiTags('router')
@Controller('router')
export class RouterController {
  constructor(private routerService: RouterService) {}

  @HttpCode(HttpStatus.OK)
  @AllowAnonymous()
  @Get('/country/:days')
  @ApiOperation({ summary: 'Get router country stats.' })
  @ApiParam({ name: 'days', description: 'Number of days' })
  @ApiOkResponse({ description: 'Country stats', type: CountryStatsDto, isArray: true })
  async getRouterStatsDefault(@Param('days', ParseIntPipe) days: number): Promise<CountryStatsDto[]> {
    return this.routerService.getCountryStats(days);
  }

  @HttpCode(HttpStatus.OK)
  @AllowAnonymous()
  @Get('/mirror/:days')
  @ApiOperation({ summary: 'Get router mirror stats.' })
  @ApiParam({ name: 'days', description: 'Number of days' })
  @ApiOkResponse({ description: 'Mirror stats', type: MirrorStatsDto, isArray: true })
  async getRouterStatsMirror(@Param('days', ParseIntPipe) days: number): Promise<MirrorStatsDto[]> {
    return this.routerService.getMirrorStats(days);
  }

  @HttpCode(HttpStatus.OK)
  @AllowAnonymous()
  @Get('/package/:days')
  @ApiOperation({ summary: 'Get router package stats.' })
  @ApiParam({ name: 'days', description: 'Number of days' })
  @ApiOkResponse({ description: 'Package stats', type: PackageStatsDto, isArray: true })
  async getRouterStatsPackage(@Param('days', ParseIntPipe) days: number): Promise<PackageStatsDto[]> {
    return this.routerService.getPackageStats(days);
  }

  @HttpCode(HttpStatus.OK)
  @AllowAnonymous()
  @Get('/per-day/:days')
  @ApiOperation({ summary: 'Get router stats per day.' })
  @ApiParam({ name: 'days', description: 'Number of days' })
  @ApiOkResponse({ description: 'Stats per day', type: PerDayStatsDto, isArray: true })
  async getRouterStatsPerDay(@Param('days', ParseIntPipe) days: number): Promise<PerDayStatsDto[]> {
    return this.routerService.getPerDayStats(days);
  }
}
