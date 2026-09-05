import { schemaResponse, schemaResponseArray } from '../api/response-schema';
import { GITLAB_GROUP_CHAOTIC_AUR } from '../auth/gitlab-groups';
import { RequireGroups } from '../decorators/require-groups.decorator';
import { RequireGroupGuard } from '../guards/require-group.guard';
import { BuildClassSuggesterService } from './build-class-suggester.service';
import { Build, Builder, Package, Repo } from './builder.entity';
import { BuilderService, type BuilderUtilizationRow, type FlakyPackageRow } from './builder.service';
import { isBuildResourceMetricKey, RESOURCE_METRIC_KEYS } from './resource-stats';
import {
  amountParamSchema,
  averageBuildTimeSchema,
  averagePackageBuildTimeSchema,
  buildClassSuggestionSchema,
  builderCountSchema,
  builderSchema,
  builderUtilizationSchema,
  buildSchema,
  buildWithUrlSchema,
  dayAverageSchema,
  dayCountSchema,
  dayRepoCountSchema,
  daysParamSchema,
  dayStatusAverageSchema,
  failedBuildHotspotSchema,
  failedBuildOverTimeSchema,
  flakyPackageSchema,
  getBuildsQuerySchema,
  getLatestBuildsQuerySchema,
  getPackagesQuerySchema,
  heavyPackageSchema,
  isValidPkgname,
  latestForPackageQuerySchema,
  offsetQuerySchema,
  packageResourceDayRowSchema,
  packageSchema,
  packagesPerBuildClassSchema,
  paginatedSchema,
  pkgbaseCompositionSchema,
  pkgCountSchema,
  pkgnameListQuerySchema,
  popularBuildsQuerySchema,
  popularPackageSchema,
  repoSchema,
  shouldBuildDecisionSchema,
  throughputDaySchema,
  type AverageBuildTime,
  type AveragePackageBuildTime,
  type BuildClassSuggestion,
  type BuilderCount,
  type BuildWithUrl,
  type DayAverage,
  type DayCount,
  type DayRepoCount,
  type DayStatusAverage,
  type FailedBuildHotspot,
  type FailedBuildOverTime,
  type GetBuildsQueryDto,
  type GetLatestBuildsQueryDto,
  type GetPackagesQueryDto,
  type HeavyPackage,
  type LatestForPackageQueryDto,
  type Package as PackageDto,
  type PackageResourceDayRow,
  type PackagesPerBuildClass,
  type Paginated,
  type PkgbaseComposition,
  type PkgCount,
  type PkgnameListQueryDto,
  type PopularBuildsQueryDto,
  type PopularPackage,
  type ShouldBuildDecision,
  type ThroughputDay,
  type UnresolvedFailedBuild,
  unresolvedFailedBuildSchema,
} from '@chaotic-next/shared-lib';
import { BadRequestException, Controller, Delete, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@thallesp/nestjs-better-auth';

@ApiTags('builder')
@Controller('builder')
export class BuilderController {
  constructor(
    private builderService: BuilderService,
    private suggesterService: BuildClassSuggesterService,
  ) {}

  @Get('builders')
  @ApiOperation({ summary: 'Get all builders.' })
  @ApiOkResponse({ description: 'List of builders', schema: schemaResponseArray(builderSchema).schema })
  async getBuilders(): Promise<Builder[]> {
    return await this.builderService.getBuilders();
  }

  @Get('packages')
  @ApiOperation({ summary: 'Get packages with pagination, search and sorting.' })
  @ApiOkResponse({
    description: 'Paginated list of packages',
    schema: schemaResponse(paginatedSchema(packageSchema)).schema,
  })
  async getPackages(
    @Query({ schema: getPackagesQuerySchema }) query: GetPackagesQueryDto,
  ): Promise<Paginated<PackageDto>> {
    return await this.builderService.getPackages(query);
  }

  @Get('package/:name')
  @ApiOperation({ summary: 'Get a package by name.' })
  @ApiParam({ name: 'name', description: 'Package name' })
  @ApiParam({ name: 'repo', description: 'Repository name', required: false })
  @ApiQuery({ name: 'repo', required: false, description: 'Repository name to scope the lookup' })
  @ApiOkResponse({ description: 'Package details', schema: schemaResponse(packageSchema).schema })
  async getPackage(@Param('name') name: string, @Query('repo') repo?: string): Promise<Package> {
    return await this.builderService.getPackage(name, repo);
  }

  @Get('repos')
  @ApiOperation({ summary: 'Get all repos.' })
  @ApiOkResponse({ description: 'List of repos', schema: schemaResponseArray(repoSchema).schema })
  async getRepos(): Promise<Repo[]> {
    return await this.builderService.getRepos();
  }

  @Get('builds')
  @ApiOperation({ summary: 'Get builds with server-side pagination, search and sorting.' })
  @ApiOkResponse({
    description: 'Paginated list of builds',
    schema: schemaResponse(paginatedSchema(buildSchema)).schema,
  })
  async getBuilds(@Query({ schema: getBuildsQuerySchema }) query: GetBuildsQueryDto): Promise<Paginated<Build>> {
    return await this.builderService.getBuilds({
      builder: query.builder,
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
  @ApiOkResponse({ description: 'List of latest builds', schema: schemaResponseArray(buildSchema).schema })
  async getLatestBuilds(
    @Query({ schema: getLatestBuildsQuerySchema }) query: GetLatestBuildsQueryDto,
  ): Promise<Build[]> {
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
  @ApiOkResponse({
    description: 'List of latest builds with URLs',
    schema: schemaResponseArray(buildWithUrlSchema).schema,
  })
  async getLatestBuildsByPkgnameWithUrls(
    @Param('amount', { schema: amountParamSchema.default(50) }) amount: number,
    @Query('offset', { schema: offsetQuerySchema.default(0) }) offset: number,
  ): Promise<BuildWithUrl[]> {
    return await this.builderService.getLatestBuilds({ amount, offset });
  }

  @Get('latest/:pkgname')
  @ApiOperation({ summary: 'Get latest builds for a package.' })
  @ApiParam({ name: 'pkgname', description: 'Package name' })
  @ApiQuery({ name: 'offset', required: false, description: 'Offset for pagination', type: Number })
  @ApiQuery({ name: 'amount', required: false, description: 'Amount to return', type: Number })
  @ApiOkResponse({ description: 'List of latest builds for package', schema: schemaResponseArray(buildSchema).schema })
  async getLatestBuildsByPkgname(
    @Param('pkgname') pkgname: string,
    @Query({ schema: latestForPackageQuerySchema }) query: LatestForPackageQueryDto,
  ): Promise<Build[]> {
    return await this.builderService.getLastBuildsForPackage({ pkgname, amount: query.amount, offset: query.offset });
  }

  @Get('latest/:pkgname/:amount')
  @ApiOperation({ summary: 'Get latest builds for a package with a limit.' })
  @ApiParam({ name: 'pkgname', description: 'Package name' })
  @ApiParam({ name: 'amount', description: 'Number of builds to return' })
  @ApiQuery({ name: 'offset', required: false, description: 'Offset for pagination', type: Number })
  @ApiOkResponse({
    description: 'List of latest builds for package with limit',
    schema: schemaResponseArray(buildSchema).schema,
  })
  async getLatestBuildsByPkgnameWithAmount(
    @Param('pkgname') pkgname: string,
    @Param('amount', { schema: amountParamSchema }) amount: number,
    @Query('offset', { schema: offsetQuerySchema.default(0) }) offset: number,
  ): Promise<Build[]> {
    return await this.builderService.getLastBuildsForPackage({ pkgname, amount, offset });
  }

  @Get('count/days')
  @ApiOperation({ summary: 'Get build counts per package per day.' })
  @ApiOkResponse({
    description: 'Build counts per package per day',
    schema: schemaResponseArray(pkgCountSchema).schema,
  })
  async getBuildsPerPackage(): Promise<PkgCount[]> {
    return await this.builderService.getBuildsPerPackage();
  }

  @Get('count/days/:days')
  @ApiOperation({ summary: 'Get build counts per package for a given number of days.' })
  @ApiParam({ name: 'days', description: 'Number of days' })
  @ApiOkResponse({
    description: 'Build counts per package for days',
    schema: schemaResponseArray(pkgCountSchema).schema,
  })
  async getBuildsPerPackageWithDays(@Param('days', { schema: daysParamSchema }) days: number): Promise<PkgCount[]> {
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
  @ApiParam({ name: 'amount', description: 'Lookback window in days' })
  @ApiQuery({ name: 'offset', required: false, description: 'Offset for pagination', type: Number })
  @ApiOkResponse({
    description: 'Build count for package per day',
    schema: schemaResponseArray(dayRepoCountSchema).schema,
  })
  async getBuildsCountByPkgnamePerDay(
    @Param('pkgname') pkgname: string,
    @Param('amount', { schema: daysParamSchema.default(50) }) amount: number,
    @Query('offset', { schema: offsetQuerySchema.default(0) }) offset: number,
  ): Promise<DayRepoCount[]> {
    return await this.builderService.getBuildsCountByPkgnamePerDay({ pkgname, amount, offset });
  }

  @Get('average/per-day/package/:pkgname')
  @ApiOperation({ summary: 'Get average build time per day for a specific package.' })
  @ApiParam({ name: 'pkgname', description: 'Package name' })
  @ApiQuery({ name: 'days', required: false, description: 'Number of days to look back', type: Number })
  @ApiOkResponse({
    description: 'Average build time per day for package',
    schema: schemaResponseArray(dayAverageSchema).schema,
  })
  async getAverageBuildTimePerDayForPackage(
    @Param('pkgname') pkgname: string,
    @Query('days', { schema: daysParamSchema.default(50) }) days: number,
  ): Promise<DayAverage[]> {
    return await this.builderService.getAverageBuildTimePerDayForPackage({ pkgname, days });
  }

  @Get('popular/:amount')
  @ApiOperation({ summary: 'Get popular packages.' })
  @ApiParam({ name: 'amount', description: 'Number of packages to return' })
  @ApiQuery({ name: 'offset', required: false, description: 'Offset for pagination', type: Number })
  @ApiQuery({ name: 'status', required: false, description: 'Build status', type: Number })
  @ApiQuery({ name: 'days', required: false, description: 'Number of days to look back', type: Number })
  @ApiOkResponse({ description: 'List of popular packages', schema: schemaResponseArray(popularPackageSchema).schema })
  async getPopularPackages(
    @Param('amount', { schema: amountParamSchema }) amount: number,
    @Query({ schema: popularBuildsQuerySchema }) query: PopularBuildsQueryDto,
  ): Promise<PopularPackage[]> {
    return await this.builderService.getPopularPackages({
      amount,
      offset: query.offset,
      status: query.status,
      days: query.days,
    });
  }

  @Get('builders/amount')
  @ApiOperation({ summary: 'Get the number of builds per builder.' })
  @ApiQuery({ name: 'days', required: false, description: 'Number of days to look back', type: Number })
  @ApiOkResponse({
    description: 'Number of builds per builder',
    schema: schemaResponseArray(builderCountSchema).schema,
  })
  async getBuildsPerBuilder(
    @Query('days', { schema: daysParamSchema.optional() }) days?: number,
  ): Promise<BuilderCount[]> {
    return await this.builderService.getBuildsPerBuilder(days);
  }

  @Get('per-day/:days')
  @ApiOperation({ summary: 'Get builds per day for all packages.' })
  @ApiParam({ name: 'days', description: 'Number of days' })
  @ApiOkResponse({ description: 'Builds per day for all packages', schema: schemaResponseArray(dayCountSchema).schema })
  async getBuildsPerDay(@Param('days', { schema: daysParamSchema }) days: number): Promise<DayCount[]> {
    return await this.builderService.getBuildsPerDay({ days: days });
  }

  @Get('added/per-day/:days')
  @ApiOperation({ summary: 'Get number of packages added to the repo per day.' })
  @ApiParam({ name: 'days', description: 'Number of days' })
  @ApiOkResponse({ description: 'Packages added per day', schema: schemaResponseArray(dayCountSchema).schema })
  async getPackageAdditionsPerDay(@Param('days', { schema: daysParamSchema }) days: number): Promise<DayCount[]> {
    return await this.builderService.getPackageAdditionsPerDay({ days: days });
  }

  @Get('average/per-day/:days')
  @ApiOperation({ summary: 'Get average build time per day per status.' })
  @ApiParam({ name: 'days', description: 'Number of days' })
  @ApiOkResponse({
    description: 'Average build time per day',
    schema: schemaResponseArray(dayStatusAverageSchema).schema,
  })
  async getAverageBuildTimePerDay(
    @Param('days', { schema: daysParamSchema }) days: number,
  ): Promise<DayStatusAverage[]> {
    return await this.builderService.getAverageBuildTimePerDay({ days: days });
  }

  @Get('builds/failed/top/:amount')
  @ApiOperation({ summary: 'Get the packages with the highest amount of failed builds.' })
  @ApiParam({ name: 'amount', description: 'Number of packages' })
  @ApiQuery({ name: 'days', required: false, description: 'Limit to the last N days', type: Number })
  @ApiOkResponse({
    description: 'Top packages by failed build count',
    schema: schemaResponseArray(failedBuildHotspotSchema).schema,
  })
  async getFailedBuildHotspots(
    @Param('amount', { schema: amountParamSchema }) amount: number,
    @Query('days', { schema: daysParamSchema.optional() }) days?: number,
  ): Promise<FailedBuildHotspot[]> {
    return await this.builderService.getFailedBuildHotspots({ amount, days });
  }

  @Get('builds/failed/over-time/:amount/:days')
  @ApiOperation({ summary: 'Failed builds per day for the top failing packages.' })
  @ApiParam({ name: 'amount', description: 'Number of packages' })
  @ApiParam({ name: 'days', description: 'Number of days' })
  @ApiOkResponse({
    description: 'Per-day failed builds per package',
    schema: schemaResponseArray(failedBuildOverTimeSchema).schema,
  })
  async getFailedBuildsOverTime(
    @Param('amount', { schema: amountParamSchema }) amount: number,
    @Param('days', { schema: daysParamSchema }) days: number,
  ): Promise<FailedBuildOverTime[]> {
    return await this.builderService.getFailedBuildsOverTime({ amount, days });
  }

  @Get('should-build/:pkgbase')
  @ApiOperation({
    summary:
      'Whether a build for the pkgbase is likely to succeed. Failure loops return false, but become true again after a cooldown without newer builds, so packages keep getting retried.',
  })
  @ApiParam({ name: 'pkgbase', description: 'Package name or pkgbase of split packages' })
  @ApiOkResponse({ description: 'Build recommendation', schema: schemaResponse(shouldBuildDecisionSchema).schema })
  async shouldBuild(@Param('pkgbase') pkgbase: string): Promise<ShouldBuildDecision> {
    if (!isValidPkgname(pkgbase)) {
      throw new BadRequestException(`Invalid package name: ${pkgbase}`, { errorCode: 'INVALID_PKGNAME' });
    }
    return await this.builderService.getShouldBuild(pkgbase);
  }

  @Get('builds/failed/unresolved')
  @ApiOperation({
    summary:
      'Active packages whose latest build verdict is a failure with no more recent success; timeouts count as failures.',
  })
  @ApiQuery({
    name: 'days',
    required: false,
    description: 'Verdict lookback window in days (default 90)',
    type: Number,
  })
  @ApiOkResponse({
    description: 'Unresolved failed builds, silenced ones included',
    schema: schemaResponseArray(unresolvedFailedBuildSchema).schema,
  })
  async getUnresolvedFailedBuilds(
    @Query('days', { schema: daysParamSchema.optional() }) days?: number,
  ): Promise<UnresolvedFailedBuild[]> {
    return await this.builderService.getUnresolvedFailedBuilds({ days });
  }

  @Post('builds/failed/unresolved/:pkgname/silence')
  @UseGuards(AuthGuard, RequireGroupGuard)
  @RequireGroups(GITLAB_GROUP_CHAOTIC_AUR)
  @HttpCode(204)
  @ApiOperation({ summary: "Silence a package's unresolved failure until its next failing build." })
  @ApiParam({ name: 'pkgname', description: 'Package name' })
  @ApiNoContentResponse({ description: 'Failure silenced' })
  async silenceUnresolvedFailedBuild(@Param('pkgname') pkgname: string): Promise<void> {
    if (!isValidPkgname(pkgname)) {
      throw new BadRequestException(`Invalid package name: ${pkgname}`, { errorCode: 'INVALID_PKGNAME' });
    }
    await this.builderService.silenceUnresolvedFailedBuild(pkgname);
  }

  @Delete('builds/failed/unresolved/:pkgname/silence')
  @UseGuards(AuthGuard, RequireGroupGuard)
  @RequireGroups(GITLAB_GROUP_CHAOTIC_AUR)
  @HttpCode(204)
  @ApiOperation({ summary: "Removes the silence on a package's unresolved failure." })
  @ApiParam({ name: 'pkgname', description: 'Package name' })
  @ApiNoContentResponse({ description: 'Silence removed' })
  async unsilenceUnresolvedFailedBuild(@Param('pkgname') pkgname: string): Promise<void> {
    if (!isValidPkgname(pkgname)) {
      throw new BadRequestException(`Invalid package name: ${pkgname}`, { errorCode: 'INVALID_PKGNAME' });
    }
    await this.builderService.unsilenceUnresolvedFailedBuild(pkgname);
  }

  @Get('stats/flaky-packages/:days')
  @ApiOperation({
    summary:
      'Intermittently failing packages: at least five genuine attempts in the window with both failures and successes.',
  })
  @ApiParam({ name: 'days', description: 'Number of days' })
  @ApiOkResponse({
    description: 'Flakiest packages by failure rate',
    schema: schemaResponseArray(flakyPackageSchema).schema,
  })
  async getFlakiestPackages(@Param('days', { schema: daysParamSchema }) days: number): Promise<FlakyPackageRow[]> {
    return await this.builderService.getFlakiestPackages({ days });
  }

  @Get('stats/builder-utilization/:days')
  @ApiOperation({
    summary: 'Builds per UTC hour-of-day per builder inside the window; only non-empty buckets are returned.',
  })
  @ApiParam({ name: 'days', description: 'Number of days' })
  @ApiOkResponse({
    description: 'Build counts per builder and hour bucket',
    schema: schemaResponseArray(builderUtilizationSchema).schema,
  })
  async getBuilderUtilization(
    @Param('days', { schema: daysParamSchema }) days: number,
  ): Promise<BuilderUtilizationRow[]> {
    return await this.builderService.getBuilderUtilization({ days });
  }

  @Get('stats/heavy-packages/:amount/:days')
  @ApiOperation({ summary: 'Get the packages with the highest average build time.' })
  @ApiOkResponse({
    description: 'Packages by average build time',
    schema: schemaResponseArray(heavyPackageSchema).schema,
  })
  async getHeavyPackages(
    @Param('amount', { schema: amountParamSchema }) amount: number,
    @Param('days', { schema: daysParamSchema }) days: number,
  ): Promise<HeavyPackage[]> {
    return await this.builderService.getHeavyPackages({ amount, days });
  }

  @Get('stats/packages-per-build-class/:days')
  @ApiOperation({ summary: 'Get the number of distinct packages built per build class.' })
  @ApiParam({ name: 'days', description: 'Number of days' })
  @ApiOkResponse({
    description: 'Distinct packages per build class',
    schema: schemaResponseArray(packagesPerBuildClassSchema).schema,
  })
  async getPackagesPerBuildClass(
    @Param('days', { schema: daysParamSchema }) days: number,
  ): Promise<PackagesPerBuildClass[]> {
    return await this.builderService.getPackagesPerBuildClass({ days });
  }

  @Get('stats/pkgbase-composition')
  @ApiOperation({ summary: 'Get active packages grouped into single pkgbases and split package members.' })
  @ApiOkResponse({
    description: 'Active packages by pkgbase relation',
    schema: schemaResponseArray(pkgbaseCompositionSchema).schema,
  })
  async getSingleVsSplitPackages(): Promise<PkgbaseComposition[]> {
    return await this.builderService.getSingleVsSplitPackages();
  }

  @Get('stats/resource/package/:pkgname/:days')
  @ApiOperation({ summary: 'Get daily container resource usage aggregates for a package.' })
  @ApiParam({ name: 'pkgname', description: 'Package name' })
  @ApiParam({ name: 'days', description: 'Number of days' })
  @ApiOkResponse({
    description: 'Daily resource usage aggregates',
    schema: schemaResponseArray(packageResourceDayRowSchema).schema,
  })
  async getPackageResourceStatsPerDay(
    @Param('pkgname') pkgname: string,
    @Param('days', { schema: daysParamSchema }) days: number,
  ): Promise<PackageResourceDayRow[]> {
    return await this.builderService.getPackageResourceStatsPerDay({ pkgname, days });
  }

  @Get('stats/heavy-packages/resource/:metric/:amount/:days')
  @ApiOperation({ summary: 'Get the packages with the highest average consumption of a resource metric.' })
  @ApiParam({ name: 'metric', description: 'Resource metric', enum: [...RESOURCE_METRIC_KEYS] })
  @ApiParam({ name: 'amount', description: 'Number of packages' })
  @ApiParam({ name: 'days', description: 'Number of days' })
  @ApiOkResponse({
    description: 'Packages by average resource consumption',
    schema: schemaResponseArray(heavyPackageSchema).schema,
  })
  async getHeavyPackagesByResourceMetric(
    @Param('metric') metric: string,
    @Param('amount', { schema: amountParamSchema }) amount: number,
    @Param('days', { schema: daysParamSchema }) days: number,
  ): Promise<HeavyPackage[]> {
    if (!isBuildResourceMetricKey(metric)) {
      throw new BadRequestException(
        `Unknown resource metric "${metric}", expected one of ${RESOURCE_METRIC_KEYS.join(', ')}`,
        {
          errorCode: 'INVALID_METRIC',
        },
      );
    }
    return await this.builderService.getHeavyPackagesByResourceMetric({ metric, amount, days });
  }

  @Get('throughput/per-day/:days')
  @ApiOperation({ summary: 'Get successful vs already-built vs skipped vs failed builds per day.' })
  @ApiParam({ name: 'days', description: 'Number of days' })
  @ApiOkResponse({ description: 'Throughput per day', schema: schemaResponseArray(throughputDaySchema).schema })
  async getThroughputPerDay(@Param('days', { schema: daysParamSchema }) days: number): Promise<ThroughputDay[]> {
    return await this.builderService.getThroughputPerDay({ days: days });
  }

  @Get('average/time')
  @ApiOperation({ summary: 'Get average build time per status.' })
  @ApiQuery({ name: 'days', required: false, description: 'Number of days to look back', type: Number })
  @ApiOkResponse({
    description: 'Average build time per status',
    schema: schemaResponseArray(averageBuildTimeSchema).schema,
  })
  async getAverageBuildTimePerStatus(
    @Query('days', { schema: daysParamSchema.optional() }) days?: number,
  ): Promise<AverageBuildTime[]> {
    return await this.builderService.getAverageBuildTimePerStatus(days);
  }

  @Get('average/pkgname')
  @ApiOperation({ summary: 'Get average build time per package.' })
  @ApiQuery({ name: 'pkgname', required: true, isArray: true, description: 'Package names to look up' })
  @ApiQuery({ name: 'days', required: false, description: 'Number of days to look back', type: Number })
  @ApiOkResponse({
    description: 'Average build time per package',
    schema: schemaResponseArray(averagePackageBuildTimeSchema).schema,
  })
  async getAverageBuildTimePerPackage(
    @Query({ schema: pkgnameListQuerySchema }) query: PkgnameListQueryDto,
  ): Promise<AveragePackageBuildTime[]> {
    return await this.builderService.getAverageBuildTimePerPackage(query.pkgname, query.days);
  }

  @Get('class/suggestions')
  @ApiOperation({ summary: 'Suggest a build class per package based on averaged resource usage of past builds.' })
  @ApiQuery({ name: 'pkgname', required: true, isArray: true, description: 'Package names to look up' })
  @ApiQuery({ name: 'days', required: false, description: 'Number of days to look back', type: Number })
  @ApiOkResponse({
    description: 'Build class suggestions per package',
    schema: schemaResponseArray(buildClassSuggestionSchema).schema,
  })
  async getBuildClassSuggestions(
    @Query({ schema: pkgnameListQuerySchema }) query: PkgnameListQueryDto,
  ): Promise<BuildClassSuggestion[]> {
    return await this.suggesterService.suggestForPackages(query.pkgname, query.days);
  }
}
