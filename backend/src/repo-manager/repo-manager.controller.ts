import { schemaResponse, schemaResponseArray } from '../api/response-schema';
import { auth } from '../auth/auth';
import { userGroupsOf } from '../auth/gitlab-groups';
import { PackageElfAnalysis } from './repo-manager.entity';
import { RepoManagerService } from './repo-manager.service';
import { type DependencyEdge } from './signal';
import {
  BrokenPackageReport,
  brokenPackageReportSchema,
  brokenPackagesQuerySchema,
  bumpPackagesBodySchema,
  bumpPackagesResultSchema,
  dependencyEdgeSchema,
  packageElfAnalysisSchema,
  PackageRebuildTriggerSources,
  packageRebuildTriggerSourcesSchema,
  Paginated,
  signalsSeedBodySchema,
  type BrokenPackagesQueryDto,
  type BumpPackagesBodyDto,
  type BumpPackagesResult,
} from '@chaotic-next/shared-lib';
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiParam,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard, Session, type UserSession } from '@thallesp/nestjs-better-auth';

@ApiTags('repo')
@ApiCookieAuth('better-auth.session_token')
@UseGuards(AuthGuard)
@Controller('repo')
export class RepoManagerController {
  constructor(private repoManager: RepoManagerService) {}

  @Get('run')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Trigger a repo manager run.' })
  @ApiNoContentResponse({ description: 'Repo manager run triggered.' })
  run(): void {
    void this.repoManager.run();
  }

  @Get('signal-scan')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Trigger a signal scan of the changed Arch packages.' })
  @ApiNoContentResponse({ description: 'Signal scan triggered.' })
  triggerSignalScan(): void {
    void this.repoManager.triggerSignalScan();
  }

  @Get('broken')
  @ApiOperation({
    summary: 'List packages whose ELF analysis is flagged broken (missing sonames / stale runtime dirs).',
  })
  @ApiOkResponse({ description: 'Broken packages.', schema: schemaResponseArray(brokenPackageReportSchema).schema })
  getBrokenPackages(
    @Query({ schema: brokenPackagesQuerySchema }) query: BrokenPackagesQueryDto,
  ): Promise<Paginated<BrokenPackageReport>> {
    return this.repoManager.getBrokenPackages(query.page, query.perPage);
  }

  @Post('broken/bump')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Manually bump a set of packages selected in the admin UI.' })
  @ApiCreatedResponse({
    description: 'The package names that were bumped.',
    schema: schemaResponse(bumpPackagesResultSchema).schema,
  })
  bumpBrokenPackages(
    @Session() session: UserSession<typeof auth>,
    @Body({ schema: bumpPackagesBodySchema }) body: BumpPackagesBodyDto,
  ): Promise<BumpPackagesResult> {
    return this.repoManager.bumpSelectedPackages(body.pkgnames, userGroupsOf(session.user));
  }

  @Post('index/arch')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Index the full Arch mirror into the ELF signal index.' })
  @ApiAcceptedResponse({ description: 'Full Arch mirror index triggered.' })
  indexArchMirror(): void {
    void this.repoManager.indexArchMirror();
  }

  @Post('index/chaotic')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Index the full Chaotic-AUR repo (CDN mirror) into the ELF signal index.' })
  @ApiAcceptedResponse({ description: 'Full Chaotic repo index triggered.' })
  indexChaoticRepo(): void {
    void this.repoManager.indexChaoticRepo();
  }

  @Get('dependencies')
  @ApiOperation({ summary: 'List dependency edges across all indexed packages (Arch and Chaotic).' })
  @ApiOkResponse({
    description: 'Dependency edges (consumer -> provider by soname).',
    schema: schemaResponseArray(dependencyEdgeSchema).schema,
  })
  getDependencies(): Promise<DependencyEdge[]> {
    return this.repoManager.getDependencyGraph();
  }

  @Get('dependencies/:pkgname')
  @ApiParam({ name: 'pkgname', description: 'Package name' })
  @ApiOperation({ summary: 'List what can cause a package to be rebuilt via our system, per trigger channel.' })
  @ApiOkResponse({
    description: 'Rebuild trigger sources for the package.',
    schema: schemaResponse(packageRebuildTriggerSourcesSchema).schema,
  })
  getRebuildTriggerSources(@Param('pkgname') pkgname: string): Promise<PackageRebuildTriggerSources> {
    return this.repoManager.getRebuildTriggerSources(pkgname);
  }

  @Get('signals/export')
  @ApiOperation({ summary: 'Export all stored ELF analyses as a JSON seed.' })
  @ApiOkResponse({
    description: 'Exported ELF analyses.',
    schema: schemaResponseArray(packageElfAnalysisSchema).schema,
  })
  exportSignalsSeed(): Promise<PackageElfAnalysis[]> {
    return this.repoManager.exportSignalsSeed();
  }

  @Post('signals/import')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Import a JSON seed of ELF analyses.' })
  @ApiAcceptedResponse({ description: 'ELF analyses imported.' })
  importSignalsSeed(@Body({ schema: signalsSeedBodySchema }) seed: unknown[]): Promise<void> {
    return this.repoManager.importSignalsSeed(seed);
  }

  @Get('update-db')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Update Chaotic-AUR database versions.' })
  @ApiNoContentResponse({ description: 'Chaotic-AUR database update triggered.' })
  updateChaoticVersions(): void {
    void this.repoManager.updateChaoticVersions();
  }
}
