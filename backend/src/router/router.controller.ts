import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import type { RouterHitBody } from '../types';
import type { RouterHit, RouterHitColumns } from './router.entity';
import { RouterHitColumPipe } from './router.pipe';
import { RouterService } from './router.service';
import { SkipThrottle } from '@nestjs/throttler';
import { AllowAnonymous } from '../auth/anonymous.decorator';

@ApiTags('router')
@Controller('router')
export class RouterController {
  constructor(private routerService: RouterService) {}

  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  @Post('hit')
  @ApiOperation({ summary: 'Register a router hit.' })
  @ApiBody({ type: Object, description: 'Router hit body' })
  @ApiOkResponse({ description: 'Router hit registered.' })
  async hitRouter(@Body() body: RouterHitBody): Promise<void> {
    return this.routerService.hitRouter(body);
  }

  @HttpCode(HttpStatus.OK)
  @Get('/:days/:type')
  @ApiOperation({ summary: 'Get router stats by days and type.' })
  @ApiParam({ name: 'type', description: 'Type of router stat' })
  @ApiParam({ name: 'days', description: 'Number of days' })
  @ApiOkResponse({ description: 'Router stats', type: Object, isArray: true })
  async getRouterStats(
    @Param('type', RouterHitColumPipe) type: RouterHitColumns,
    @Param('days', ParseIntPipe) days: number,
  ): Promise<RouterHit[]> {
    return this.routerService.getGeneralStats(days, type);
  }

  @HttpCode(HttpStatus.OK)
  @AllowAnonymous()
  @Get('/country/:days')
  @ApiOperation({ summary: 'Get router country stats.' })
  @ApiParam({ name: 'days', description: 'Number of days' })
  @ApiOkResponse({ description: 'Country stats', type: Object, isArray: true })
  async getRouterStatsDefault(
    @Param('days', ParseIntPipe) days: number,
  ): Promise<{ country: string; count: number }[]> {
    return this.routerService.getCountryStats(days);
  }

  @HttpCode(HttpStatus.OK)
  @AllowAnonymous()
  @Get('/mirror/:days')
  @ApiOperation({ summary: 'Get router mirror stats.' })
  @ApiParam({ name: 'days', description: 'Number of days' })
  @ApiOkResponse({ description: 'Mirror stats', type: Object, isArray: true })
  async getRouterStatsMirror(@Param('days', ParseIntPipe) days: number): Promise<{ mirror: string; count: number }[]> {
    return this.routerService.getMirrorStats(days);
  }

  @HttpCode(HttpStatus.OK)
  @AllowAnonymous()
  @Get('/package/:days')
  @ApiOperation({ summary: 'Get router package stats.' })
  @ApiParam({ name: 'days', description: 'Number of days' })
  @ApiOkResponse({ description: 'Package stats', type: Object, isArray: true })
  async getRouterStatsPackage(
    @Param('days', ParseIntPipe) days: number,
  ): Promise<{ pkgbase: string; count: number }[]> {
    return this.routerService.getPackageStats(days);
  }

  @HttpCode(HttpStatus.OK)
  @AllowAnonymous()
  @Get('/per-day/:days')
  @ApiOperation({ summary: 'Get router stats per day.' })
  @ApiParam({ name: 'days', description: 'Number of days' })
  @ApiOkResponse({ description: 'Stats per day', type: Object, isArray: true })
  async getRouterStatsPerDay(@Param('days', ParseIntPipe) days: number): Promise<{ day: string; count: number }[]> {
    return this.routerService.getPerDayStats(days);
  }
}

// All endpoints are public, no Bearer/OAuth needed
