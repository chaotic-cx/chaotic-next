import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Package as PackageDto, Paginated } from '@chaotic-next/shared-lib';
import { Build, Builder, Package, Repo } from './builder.entity';
import { BuilderService } from './builder.service';
import { GetBuildsQueryDto, GetLatestBuildsQueryDto, GetPackagesQueryDto } from './builder.dto';

@ApiTags('builder')
@Controller('builder')
export class BuilderController {
  constructor(private builderService: BuilderService) {}

  @Get('builders')
  @ApiOperation({ summary: 'Get all builders.' })
  @ApiOkResponse({ description: 'List of builders', type: Builder, isArray: true })
  async getBuilders(): Promise<Builder[]> {
    return await this.builderService.getBuilders();
  }

  @Get('packages')
  @ApiOperation({ summary: 'Get packages with pagination, search and sorting.' })
  @ApiOkResponse({ description: 'Paginated list of packages' })
  async getPackages(@Query() query: GetPackagesQueryDto): Promise<Paginated<PackageDto>> {
    return await this.builderService.getPackages(query);
  }

  @Get('package/:name')
  @ApiOperation({ summary: 'Get a package by name.' })
  @ApiParam({ name: 'name', description: 'Package name' })
  @ApiParam({ name: 'repo', description: 'Repository name', required: false })
  @ApiOkResponse({ description: 'Package details', type: Object })
  async getPackage(@Param('name') name: string, @Query('repo') repo?: string): Promise<Package> {
    return await this.builderService.getPackage(name, repo);
  }

  @Get('repos')
  @ApiOperation({ summary: 'Get all repos.' })
  @ApiOkResponse({ description: 'List of repos', type: Repo, isArray: true })
  async getRepos(): Promise<Repo[]> {
    return await this.builderService.getRepos();
  }

  @Get('builds')
  @ApiOperation({ summary: 'Get builds with server-side pagination, search and sorting.' })
  @ApiOkResponse({ description: 'Paginated list of builds' })
  async getBuilds(@Query() query: GetBuildsQueryDto): Promise<Paginated<Build>> {
    return await this.builderService.getBuilds({
      builder: query.builder ?? '',
      repo: query.repo ?? '',
      status: query.status,
      page: query.page,
      perPage: query.perPage,
      q: query.q,
      sort: query.sort,
      order: query.order,
    });
  }

  @Get('latest')
  @ApiOperation({ summary: 'Get latest builds.' })
  @ApiOkResponse({ description: 'List of latest builds', type: Build, isArray: true })
  async getLatestBuilds(@Query() query: GetLatestBuildsQueryDto): Promise<Build[]> {
    return await this.builderService.getLastBuilds({
      amount: query.amount ?? 50,
      offset: query.offset ?? 0,
      status: query.status,
    });
  }

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

  @Get('latest/:pkgname/:amount')
  @ApiOperation({ summary: 'Get latest builds for a package with a limit.' })
  @ApiParam({ name: 'pkgname', description: 'Package name' })
  @ApiParam({ name: 'amount', description: 'Number of builds to return' })
  @ApiQuery({ name: 'offset', required: false, description: 'Offset for pagination', type: Number })
  @ApiOkResponse({ description: 'List of latest builds for package with limit', type: Build, isArray: true })
  async getLatestBuildsByPkgnameWithAmount(
    @Param('pkgname') pkgname: string,
    @Param('amount', ParseIntPipe) amount: number,
    @Query('offset', new ParseIntPipe({ optional: true })) offset = 0,
  ): Promise<Build[]> {
    return await this.builderService.getLastBuildsForPackage({ pkgname, amount, offset });
  }

  @Get('count/days')
  @ApiOperation({ summary: 'Get build counts per package per day.' })
  @ApiOkResponse({ description: 'Build counts per package per day', type: Object, isArray: true })
  async getBuildsPerPackage(): Promise<{ pkgbase: string; count: string }[]> {
    return await this.builderService.getBuildsPerPackage();
  }

  @Get('count/days/:days')
  @ApiOperation({ summary: 'Get build counts per package for a given number of days.' })
  @ApiParam({ name: 'days', description: 'Number of days' })
  @ApiOkResponse({ description: 'Build counts per package for days', type: Object, isArray: true })
  async getBuildsPerPackageWithDays(
    @Param('days', ParseIntPipe) days: number,
  ): Promise<{ pkgbase: string; count: string }[]> {
    return await this.builderService.getBuildsPerPackage({ days });
  }

  @Get('count/package/:pkgname')
  @ApiOperation({ summary: 'Get build count for a package.' })
  @ApiParam({ name: 'pkgname', description: 'Package name' })
  @ApiOkResponse({ description: 'Build count for package', type: Number })
  async getLatestBuildsCountByPkgname(@Param('pkgname') pkgname: string): Promise<number> {
    return await this.builderService.getLastBuildsCountForPackage(pkgname);
  }

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
  ): Promise<{ day: string; repo: string; count: string }[]> {
    return await this.builderService.getBuildsCountByPkgnamePerDay({ pkgname, amount, offset });
  }

  @Get('popular/:amount')
  @ApiOperation({ summary: 'Get popular packages.' })
  @ApiParam({ name: 'amount', description: 'Number of packages to return' })
  @ApiQuery({ name: 'offset', required: false, description: 'Offset for pagination', type: Number })
  @ApiQuery({ name: 'status', required: false, description: 'Build status', type: Number })
  @ApiQuery({ name: 'days', required: false, description: 'Number of days to look back', type: Number })
  @ApiOkResponse({ description: 'List of popular packages', type: Object, isArray: true })
  async getPopularPackages(
    @Param('amount', ParseIntPipe) amount: number,
    @Query('offset', new ParseIntPipe({ optional: true })) offset = 0,
    @Query('status', new ParseIntPipe({ optional: true })) status?: number,
    @Query('days', new ParseIntPipe({ optional: true })) days?: number,
  ): Promise<{ pkgbase_pkgname: string; count: string }[]> {
    return await this.builderService.getPopularPackages({ amount, offset, status, days });
  }

  @Get('builders/amount')
  @ApiOperation({ summary: 'Get the number of builds per builder.' })
  @ApiQuery({ name: 'days', required: false, description: 'Number of days to look back', type: Number })
  @ApiOkResponse({ description: 'Number of builds per builder', type: Object, isArray: true })
  async getBuildsPerBuilder(
    @Query('days', new ParseIntPipe({ optional: true })) days?: number,
  ): Promise<{ name: string; count: string }[]> {
    return await this.builderService.getBuildsPerBuilder(days);
  }

  @Get('per-day/pkgname/:pkgname/:days')
  @ApiOperation({ summary: 'Get builds per day for a package.' })
  @ApiParam({ name: 'pkgname', description: 'Package name' })
  @ApiParam({ name: 'days', description: 'Number of days' })
  @ApiQuery({ name: 'offset', required: false, description: 'Offset for pagination', type: Number })
  @ApiOkResponse({ description: 'Builds per day for package', type: Object, isArray: true })
  async getBuildsPerDayDefault(
    @Param('pkgname') pkgname: string,
    @Param('days', ParseIntPipe) days: number,
    @Query('offset', new ParseIntPipe({ optional: true })) offset = 0,
  ): Promise<
    {
      day: string;
      repo: string;
      count: string;
    }[]
  > {
    return await this.builderService.getBuildsCountByPkgnamePerDay({ offset, pkgname, amount: days });
  }

  @Get('per-day/:days')
  @ApiOperation({ summary: 'Get builds per day for all packages.' })
  @ApiParam({ name: 'days', description: 'Number of days' })
  @ApiOkResponse({ description: 'Builds per day for all packages', type: Object, isArray: true })
  async getBuildsPerDay(@Param('days', ParseIntPipe) days: number): Promise<{ day: string; count: string }[]> {
    return await this.builderService.getBuildsPerDay({ days: days });
  }

  @Get('average/time')
  @ApiOperation({ summary: 'Get average build time per status.' })
  @ApiQuery({ name: 'days', required: false, description: 'Number of days to look back', type: Number })
  @ApiOkResponse({ description: 'Average build time per status', type: Object, isArray: true })
  async getAverageBuildTimePerStatus(@Query('days', new ParseIntPipe({ optional: true })) days?: number): Promise<
    {
      average_build_time: string;
      status: string;
    }[]
  > {
    return await this.builderService.getAverageBuildTimePerStatus(days);
  }

  @Get('average/pkgname')
  @ApiOperation({ summary: 'Get average build time per package.' })
  @ApiQuery({ name: 'pkgname', required: true, isArray: true, description: 'Package names to look up' })
  @ApiQuery({ name: 'days', required: false, description: 'Number of days to look back', type: Number })
  @ApiOkResponse({ description: 'Average build time per package', type: Object, isArray: true })
  async getAverageBuildTimePerPackage(
    @Query('pkgname') pkgnames: string[],
    @Query('days', new ParseIntPipe({ optional: true })) days?: number,
  ): Promise<
    {
      pkgname: string;
      average_build_time: string;
      samples: string;
    }[]
  > {
    return await this.builderService.getAverageBuildTimePerPackage(
      Array.isArray(pkgnames) ? pkgnames : [pkgnames],
      days,
    );
  }
}
