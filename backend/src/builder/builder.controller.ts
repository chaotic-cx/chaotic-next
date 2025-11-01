import { Controller, Get, Param, ParseBoolPipe, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AllowAnonymous } from '../auth/anonymous.decorator';
import { Build, Builder, Package, Repo } from './builder.entity';
import { BuilderService } from './builder.service';
import { BuildStatus } from '@./shared-lib';

@ApiTags('builder')
@Controller('builder')
export class BuilderController {
  constructor(private builderService: BuilderService) {}

  @AllowAnonymous()
  @Get('builders')
  @ApiOperation({ summary: 'Get all builders.' })
  @ApiOkResponse({ description: 'List of builders', type: Builder, isArray: true })
  async getBuilders(): Promise<Builder[]> {
    return await this.builderService.getBuilders();
  }

  @AllowAnonymous()
  @Get('packages')
  @ApiOperation({ summary: 'Get all packages.' })
  @ApiQuery({ name: 'repo', required: false, description: 'Add repo to information' })
  @ApiOkResponse({ description: 'List of packages', type: Package, isArray: true })
  async getPackages(@Query('repo', new ParseBoolPipe({ optional: true })) repo = false): Promise<Package[]> {
    return await this.builderService.getPackages({ repo });
  }

  @AllowAnonymous()
  @Get('package/:name')
  @ApiOperation({ summary: 'Get a package by name.' })
  @ApiParam({ name: 'name', description: 'Package name' })
  @ApiOkResponse({ description: 'Package details', type: Object })
  async getPackage(@Param('name') name: string): Promise<Package> {
    return await this.builderService.getPackage(name);
  }

  @AllowAnonymous()
  @Get('repos')
  @ApiOperation({ summary: 'Get all repos.' })
  @ApiOkResponse({ description: 'List of repos', type: Repo, isArray: true })
  async getRepos(): Promise<Repo[]> {
    return await this.builderService.getRepos();
  }

  @AllowAnonymous()
  @Get('builds')
  @ApiOperation({ summary: 'Get builds with optional filters.' })
  @ApiQuery({ name: 'builder', required: false, description: 'Builder name' })
  @ApiQuery({ name: 'offset', required: false, description: 'Offset for pagination', type: Number })
  @ApiQuery({ name: 'amount', required: false, description: 'Amount to return', type: Number })
  @ApiOkResponse({ description: 'List of builds', type: Build, isArray: true })
  async getBuilds(
    @Query('builder') builder: string,
    @Query('offset', new ParseIntPipe({ optional: true })) offset = 0,
    @Query('amount', new ParseIntPipe({ optional: true })) amount = 50,
  ): Promise<Build[]> {
    return await this.builderService.getBuilds({ builder, offset, amount });
  }

  @AllowAnonymous()
  @Get('latest')
  @ApiOperation({ summary: 'Get latest builds.' })
  @ApiQuery({ name: 'amount', required: false, description: 'Amount to return', type: Number })
  @ApiQuery({ name: 'offset', required: false, description: 'Offset for pagination', type: Number })
  @ApiQuery({ name: 'status', required: false, description: 'Build status', type: Number })
  @ApiOkResponse({ description: 'List of latest builds', type: Build, isArray: true })
  async getLatestBuilds(
    @Query('amount', new ParseIntPipe({ optional: true })) amount = 50,
    @Query('offset', new ParseIntPipe({ optional: true })) offset = 0,
    @Query('status', new ParseIntPipe({ optional: true })) status?: BuildStatus,
  ): Promise<Build[]> {
    return await this.builderService.getLastBuilds({ amount, offset, status });
  }

  @AllowAnonymous()
  @Get('latest/:pkgname')
  @ApiOperation({ summary: 'Get latest builds for a package.' })
  @ApiParam({ name: 'pkgname', description: 'Package name' })
  @ApiQuery({ name: 'offset', required: false, description: 'Offset for pagination', type: Number })
  @ApiQuery({ name: 'amount', required: false, description: 'Amount to return', type: Number })
  @ApiOkResponse({ description: 'List of latest builds for package', type: Build, isArray: true })
  async getLatestBuildsByPkgname(
    @Param('pkgname') pkgname: string,
    @Query('offset', new ParseIntPipe({ optional: true })) offset = 0,
    @Query('amount', new ParseIntPipe({ optional: true })) amount = 30,
  ): Promise<Build[]> {
    return await this.builderService.getLastBuildsForPackage({ pkgname, amount, offset });
  }

  @AllowAnonymous()
  @Get('latest/:pkgname/:amount')
  @ApiOperation({ summary: 'Get latest builds for a package with a limit.' })
  @ApiParam({ name: 'pkgname', description: 'Package name' })
  @ApiParam({ name: 'days', description: 'Number of days' })
  @ApiQuery({ name: 'offset', required: false, description: 'Offset for pagination', type: Number })
  @ApiOkResponse({ description: 'List of latest builds for package with limit', type: Build, isArray: true })
  async getLatestBuildsByPkgnameWithAmount(
    @Param('pkgname') pkgname: string,
    @Param('days', ParseIntPipe) days: number,
    @Query('offset', new ParseIntPipe({ optional: true })) offset = 0,
  ): Promise<Build[]> {
    return await this.builderService.getLastBuildsForPackage({ pkgname, amount: days, offset });
  }

  @AllowAnonymous()
  @Get('count/days')
  @ApiOperation({ summary: 'Get build counts per package per day.' })
  @ApiOkResponse({ description: 'Build counts per package per day', type: Object, isArray: true })
  async getBuildsPerPackage(): Promise<{ pkgbase: string; count: string }[]> {
    return await this.builderService.getBuildsPerPackage();
  }

  @AllowAnonymous()
  @Get('count/days/:days')
  @ApiOperation({ summary: 'Get build counts per package for a given number of days.' })
  @ApiParam({ name: 'days', description: 'Number of days' })
  @ApiOkResponse({ description: 'Build counts per package for days', type: Object, isArray: true })
  async getBuildsPerPackageWithDays(
    @Param('days', ParseIntPipe) days: number,
  ): Promise<{ pkgbase: string; count: string }[]> {
    return await this.builderService.getBuildsPerPackage({ days });
  }

  @AllowAnonymous()
  @Get('count/package/:pkgname')
  @ApiOperation({ summary: 'Get build count for a package.' })
  @ApiParam({ name: 'pkgname', description: 'Package name' })
  @ApiOkResponse({ description: 'Build count for package', type: Number })
  async getLatestBuildsCountByPkgname(@Param('pkgname') pkgname: string): Promise<number> {
    return await this.builderService.getLastBuildsCountForPackage(pkgname);
  }

  @AllowAnonymous()
  @Get('count/:pkgname/:amount')
  @ApiOperation({ summary: 'Get build count for a package per day.' })
  @ApiParam({ name: 'pkgname', description: 'Package name' })
  @ApiParam({ name: 'amount', description: 'Amount' })
  @ApiQuery({ name: 'offset', required: false, description: 'Offset for pagination', type: Number })
  @ApiOkResponse({ description: 'Build count for package per day', type: Object, isArray: true })
  async getBuildsCountByPkgnamePerDay(
    @Param('pkgname') pkgname: string,
    @Param('amount', new ParseIntPipe({ optional: true })) amount = 50,
    @Query('offset', new ParseIntPipe({ optional: true })) offset = 0,
  ): Promise<{ day: string; count: string }[]> {
    return await this.builderService.getBuildsCountByPkgnamePerDay({ pkgname, amount, offset });
  }

  @AllowAnonymous()
  @Get('popular/:amount')
  @ApiOperation({ summary: 'Get popular packages.' })
  @ApiParam({ name: 'amount', description: 'Number of packages to return' })
  @ApiQuery({ name: 'offset', required: false, description: 'Offset for pagination', type: Number })
  @ApiQuery({ name: 'status', required: false, description: 'Build status', type: Number })
  @ApiOkResponse({ description: 'List of popular packages', type: Object, isArray: true })
  async getPopularPackages(
    @Param('amount', ParseIntPipe) amount: number,
    @Query('offset', new ParseIntPipe({ optional: true })) offset = 0,
    @Query('status', new ParseIntPipe({ optional: true })) status?: number,
  ): Promise<{ pkgname: string; count: string }[]> {
    return await this.builderService.getPopularPackages({ amount, offset, status });
  }

  @AllowAnonymous()
  @Get('builders/amount')
  @ApiOperation({ summary: 'Get the number of builds per builder.' })
  @ApiOkResponse({ description: 'Number of builds per builder', type: Object, isArray: true })
  async getBuildersAmount(): Promise<{ builderId: string; count: string }[]> {
    return await this.builderService.getBuildsPerBuilder();
  }

  @AllowAnonymous()
  @Get('per-day/pkgname/:pkgname/:days')
  @ApiOperation({ summary: 'Get builds per day for a package.' })
  @ApiParam({ name: 'pkgname', description: 'Package name' })
  @ApiParam({ name: 'days', description: 'Number of days' })
  @ApiQuery({ name: 'offset', required: false, description: 'Offset for pagination', type: Number })
  @ApiOkResponse({ description: 'Builds per day for package', type: Object, isArray: true })
  async getBuildsPerDayDefault(
    @Param('pkgname') pkgname: string,
    @Param('days', ParseIntPipe) days: number,
    @Query('offset', new ParseIntPipe({ optional: true })) offset: number,
  ): Promise<
    {
      day: string;
      count: string;
    }[]
  > {
    return await this.builderService.getBuildsCountByPkgnamePerDay({ offset, pkgname, amount: days });
  }

  @AllowAnonymous()
  @Get('per-day/:days')
  @ApiOperation({ summary: 'Get builds per day for all packages.' })
  @ApiParam({ name: 'days', description: 'Number of days' })
  @ApiOkResponse({ description: 'Builds per day for all packages', type: Object, isArray: true })
  async getBuildsPerDay(@Param('days', ParseIntPipe) days: number): Promise<{ day: string; count: string }[]> {
    return await this.builderService.getBuildsPerDay({ days: days });
  }

  @AllowAnonymous()
  @Get('latest/url/:amount')
  @ApiOperation({ summary: 'Get latest builds with URLs.' })
  @ApiParam({ name: 'amount', description: 'Number of builds to return' })
  @ApiQuery({ name: 'offset', required: false, description: 'Offset for pagination', type: Number })
  @ApiOkResponse({ description: 'List of latest builds with URLs', type: Object, isArray: true })
  async getLatestBuildsByPkgnameWithUrls(
    @Param('amount', new ParseIntPipe({ optional: true })) amount = 50,
    @Query('offset', new ParseIntPipe({ optional: true })) offset = 0,
  ): Promise<{ commit: string; logUrl: string; pkgname: string; timeToEnd: string; version: string }[]> {
    return await this.builderService.getLatestBuilds({ amount, offset });
  }

  @AllowAnonymous()
  @Get('average/time')
  @ApiOperation({ summary: 'Get average build time per status.' })
  @ApiOkResponse({ description: 'Average build time per status', type: Object, isArray: true })
  async getAverageBuildTimePerStatus(): Promise<
    {
      average_build_time: string;
      status: string;
    }[]
  > {
    return await this.builderService.getAverageBuildTimePerStatus();
  }
}
