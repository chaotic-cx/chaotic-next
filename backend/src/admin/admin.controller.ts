import type { Package as PackageDto, Paginated, PipelineTriggerAction } from '@chaotic-next/shared-lib';
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@thallesp/nestjs-better-auth';
import { Builder, Package, Repo } from '../builder/builder.entity';
import { ArchlinuxPackage } from '../repo-manager/repo-manager.entity';
import {
  AdminPackageElfAnalysisDto,
  CreateBuilderBodyDto,
  CreateElfAnalysisBodyDto,
  ListAdminPackagesQueryDto,
  ListArchPackagesQueryDto,
  ListBuildersQueryDto,
  ListElfAnalysisQueryDto,
  ListMrActionsQueryDto,
  ListPackageBumpsQueryDto,
  ListPipelineTriggersQueryDto,
  MrActionDto,
  PackageBumpDto,
  PipelineTriggerDto,
  RescanPackagesDto,
} from './admin.dto';
import type { CreateArchPackageBody, CreatePackageBody, CreateRepoBody } from './admin.service';
import { AdminService } from './admin.service';
import { PKG_TYPE_ARCH, PKG_TYPE_CHAOTIC } from '@chaotic-next/shared-lib';

@ApiTags('admin')
@ApiCookieAuth('better-auth.session_token')
@UseGuards(AuthGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('packages')
  @ApiOperation({ summary: 'List packages (admin)' })
  @ApiOkResponse({ description: 'Paginated list of packages' })
  async listPackages(@Query() query: ListAdminPackagesQueryDto): Promise<Paginated<PackageDto>> {
    return this.adminService.listPackages(
      query.page,
      query.perPage,
      query.q,
      query.repoId,
      query.active === undefined ? undefined : query.active === 'true',
    );
  }

  @Patch('packages/:id')
  @ApiOperation({ summary: 'Update a package' })
  @ApiOkResponse({ description: 'The updated package', type: Package })
  updatePackage(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<CreatePackageBody>): Promise<Package> {
    return this.adminService.updatePackage(id, body);
  }

  @Delete('packages/:id')
  @ApiOperation({ summary: 'Delete a package' })
  @ApiOkResponse({ description: 'Package deleted' })
  deletePackage(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.adminService.deletePackage(id);
  }

  @Get('arch-packages')
  @ApiOperation({ summary: 'List Arch packages (admin)' })
  @ApiOkResponse({ description: 'Paginated list of Arch packages' })
  async listArchPackages(@Query() query: ListArchPackagesQueryDto): Promise<Paginated<ArchlinuxPackage>> {
    return this.adminService.listArchPackages(query.page, query.perPage, query.q);
  }

  @Patch('arch-packages/:id')
  @ApiOperation({ summary: 'Update an Arch package' })
  @ApiOkResponse({ description: 'The updated Arch package', type: ArchlinuxPackage })
  updateArchPackage(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<CreateArchPackageBody>,
  ): Promise<ArchlinuxPackage> {
    return this.adminService.updateArchPackage(id, body);
  }

  @Delete('arch-packages/:id')
  @ApiOperation({ summary: 'Delete an Arch package' })
  @ApiOkResponse({ description: 'Arch package deleted' })
  deleteArchPackage(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.adminService.deleteArchPackage(id);
  }

  @Get('repos')
  @ApiOperation({ summary: 'List repos (admin)' })
  @ApiOkResponse({ description: 'List of repos', type: Repo, isArray: true })
  async listRepos(): Promise<Repo[]> {
    return this.adminService.listRepos();
  }

  @Post('repos')
  @ApiOperation({ summary: 'Create a repo' })
  @ApiCreatedResponse({ description: 'The created repo', type: Repo })
  createRepo(@Body() body: CreateRepoBody): Promise<Repo> {
    return this.adminService.createRepo(body);
  }

  @Patch('repos/:id')
  @ApiOperation({ summary: 'Update a repo' })
  @ApiOkResponse({ description: 'The updated repo', type: Repo })
  updateRepo(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<CreateRepoBody>): Promise<Repo> {
    return this.adminService.updateRepo(id, body);
  }

  @Delete('repos/:id')
  @ApiOperation({ summary: 'Delete a repo' })
  @ApiOkResponse({ description: 'Repo deleted' })
  deleteRepo(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.adminService.deleteRepo(id);
  }

  @Get('builders')
  @ApiOperation({ summary: 'List builders (admin)' })
  @ApiOkResponse({ description: 'Paginated list of builders' })
  async listBuilders(@Query() query: ListBuildersQueryDto): Promise<Paginated<Builder>> {
    return this.adminService.listBuilders(
      query.page,
      query.perPage,
      query.q,
      query.active === undefined ? undefined : query.active === 'true',
    );
  }

  @Post('builders')
  @ApiOperation({ summary: 'Create a builder' })
  @ApiCreatedResponse({ description: 'The created builder', type: Builder })
  createBuilder(@Body() body: CreateBuilderBodyDto): Promise<Builder> {
    return this.adminService.createBuilder(body);
  }

  @Patch('builders/:id')
  @ApiOperation({ summary: 'Update a builder' })
  @ApiOkResponse({ description: 'The updated builder', type: Builder })
  updateBuilder(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<CreateBuilderBodyDto>): Promise<Builder> {
    return this.adminService.updateBuilder(id, body);
  }

  @Delete('builders/:id')
  @ApiOperation({ summary: 'Delete a builder' })
  @ApiOkResponse({ description: 'Builder deleted' })
  deleteBuilder(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.adminService.deleteBuilder(id);
  }

  @Get('mr-actions')
  @ApiOperation({ summary: 'List merge-request actions (admin)' })
  @ApiOkResponse({ description: 'Paginated list of MR actions', type: MrActionDto, isArray: true })
  async listMrActions(@Query() query: ListMrActionsQueryDto): Promise<Paginated<MrActionDto>> {
    return this.adminService.listMrActions(query.page, query.perPage, query.q, query.action);
  }

  @Get('pipeline-triggers')
  @ApiOperation({ summary: 'List triggered pipelines (admin)' })
  @ApiOkResponse({ description: 'Paginated list of triggered pipelines', type: PipelineTriggerDto, isArray: true })
  async listPipelineTriggers(@Query() query: ListPipelineTriggersQueryDto): Promise<Paginated<PipelineTriggerAction>> {
    return this.adminService.listPipelineTriggers(query.page, query.perPage, query.q, query.operation);
  }

  @Get('package-bumps')
  @ApiOperation({ summary: 'List package bumps (admin)' })
  @ApiOkResponse({ description: 'Paginated list of package bumps', type: PackageBumpDto, isArray: true })
  async listPackageBumps(@Query() query: ListPackageBumpsQueryDto): Promise<Paginated<PackageBumpDto>> {
    return this.adminService.listPackageBumps(query.page, query.perPage, query.q, query.bumpType, query.triggerFrom);
  }

  @Get('package-elf-analysis')
  @ApiOperation({ summary: 'List package ELF analysis rows (admin)' })
  @ApiOkResponse({
    description: 'Paginated list of package ELF analysis rows',
    type: AdminPackageElfAnalysisDto,
    isArray: true,
  })
  async listElfAnalysis(@Query() query: ListElfAnalysisQueryDto): Promise<Paginated<AdminPackageElfAnalysisDto>> {
    return this.adminService.listElfAnalysis(
      query.page,
      query.perPage,
      query.q,
      query.pkgType === undefined || (query.pkgType !== PKG_TYPE_ARCH && query.pkgType !== PKG_TYPE_CHAOTIC)
        ? undefined
        : query.pkgType,
      query.broken === undefined ? undefined : query.broken === 'true',
    );
  }

  @Get('package-elf-analysis/:id/bumps')
  @ApiOperation({ summary: 'List rebuild-trigger bumps for an ELF analysis row' })
  @ApiOkResponse({ description: 'Rebuild-trigger bumps for the ELF analysis row', type: PackageBumpDto, isArray: true })
  listElfAnalysisBumps(@Param('id', ParseIntPipe) id: number): Promise<PackageBumpDto[]> {
    return this.adminService.listElfAnalysisBumps(id);
  }

  @Patch('package-elf-analysis/:id')
  @ApiOperation({ summary: 'Update a package ELF analysis row' })
  @ApiOkResponse({ description: 'The updated package ELF analysis row', type: AdminPackageElfAnalysisDto })
  updateElfAnalysis(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<CreateElfAnalysisBodyDto>,
  ): Promise<AdminPackageElfAnalysisDto> {
    return this.adminService.updateElfAnalysis(id, body);
  }

  @Delete('package-elf-analysis/:id')
  @ApiOperation({ summary: 'Delete a package ELF analysis row' })
  @ApiOkResponse({ description: 'Package ELF analysis row deleted' })
  deleteElfAnalysis(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.adminService.deleteElfAnalysis(id);
  }

  @Post('rescan')
  @ApiOperation({ summary: 'Trigger an ELF signal rescan for packages by name.' })
  @ApiOkResponse({ description: 'Rescan result' })
  rescanPackages(@Body() body: RescanPackagesDto): Promise<{ rescanned: number; failed: string[] }> {
    return this.adminService.rescanPackages(body.packages);
  }
}
