import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse, ApiCreatedResponse, ApiCookieAuth } from '@nestjs/swagger';
import { AuthGuard } from '@thallesp/nestjs-better-auth';
import { Paginated } from '@chaotic-next/shared-lib';
import { BrokenPackageReport, PackageRebuildTriggerSources } from '../interfaces/repo-manager';
import { RepoManagerService } from './repo-manager.service';
import { PackageElfAnalysis } from './repo-manager.entity';
import type { DependencyEdge } from './signal';

@ApiTags('repo')
@ApiCookieAuth('better-auth.session_token')
@UseGuards(AuthGuard)
@Controller('repo')
export class RepoManagerController {
  constructor(private repoManager: RepoManagerService) {}

  @Get('run')
  @ApiOperation({ summary: 'Trigger a repo manager run.' })
  @ApiOkResponse({ description: 'Repo manager run triggered.' })
  run(): void {
    void this.repoManager.run();
  }

  @Get('signal-scan')
  @ApiOperation({ summary: 'Trigger a signal scan of the changed Arch packages.' })
  @ApiOkResponse({ description: 'Signal scan triggered.' })
  triggerSignalScan(): void {
    void this.repoManager.triggerSignalScan();
  }

  @Get('broken')
  @ApiOperation({
    summary: 'List packages whose ELF analysis is flagged broken (missing sonames / stale runtime dirs).',
  })
  @ApiOkResponse({ description: 'Broken packages.', type: Object })
  getBrokenPackages(
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('perPage', new ParseIntPipe({ optional: true })) perPage?: number,
  ): Promise<Paginated<BrokenPackageReport>> {
    return this.repoManager.getBrokenPackages(page, perPage);
  }

  @Post('index/arch')
  @ApiOperation({ summary: 'Index the full Arch mirror into the ELF signal index.' })
  @ApiCreatedResponse({ description: 'Full Arch mirror index triggered.' })
  indexArchMirror(): void {
    void this.repoManager.indexArchMirror();
  }

  @Post('index/chaotic')
  @ApiOperation({ summary: 'Index the full Chaotic-AUR repo (CDN mirror) into the ELF signal index.' })
  @ApiCreatedResponse({ description: 'Full Chaotic repo index triggered.' })
  indexChaoticRepo(): void {
    void this.repoManager.indexChaoticRepo();
  }

  @Get('dependencies')
  @ApiOperation({ summary: 'List dependency edges across all indexed packages (Arch and Chaotic).' })
  @ApiOkResponse({ description: 'Dependency edges (consumer -> provider by soname).' })
  getDependencies(): Promise<DependencyEdge[]> {
    return this.repoManager.getDependencyGraph();
  }

  @Get('dependencies/:pkgname')
  @ApiOperation({ summary: 'List what can cause a package to be rebuilt via our system, per trigger channel.' })
  @ApiOkResponse({ description: 'Rebuild trigger sources for the package.', type: Object })
  getRebuildTriggerSources(@Param('pkgname') pkgname: string): Promise<PackageRebuildTriggerSources> {
    return this.repoManager.getRebuildTriggerSources(pkgname);
  }

  @Get('signals/export')
  @ApiOperation({ summary: 'Export all stored ELF analyses as a JSON seed.' })
  @ApiOkResponse({ description: 'Exported ELF analyses.' })
  exportSignalsSeed(): Promise<PackageElfAnalysis[]> {
    return this.repoManager.exportSignalsSeed();
  }

  @Post('signals/import')
  @ApiOperation({ summary: 'Import a JSON seed of ELF analyses.' })
  @ApiCreatedResponse({ description: 'ELF analyses imported.' })
  importSignalsSeed(@Body() seed: unknown[]): Promise<void> {
    return this.repoManager.importSignalsSeed(seed);
  }

  @Post('signals/import-file')
  @ApiOperation({ summary: 'Stream-import a newline-delimited JSON seed file of ELF analyses from disk.' })
  @ApiCreatedResponse({ description: 'ELF analyses imported.' })
  importSignalsSeedFile(@Body('path') path: string): Promise<void> {
    return this.repoManager.importSignalsSeedFile(path);
  }

  @Get('update-db')
  @ApiOperation({ summary: 'Update Chaotic-AUR database versions.' })
  @ApiOkResponse({ description: 'Chaotic-AUR database update triggered.' })
  updateChaoticVersions(): void {
    void this.repoManager.updateChaoticVersions();
  }
}
