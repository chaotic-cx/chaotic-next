import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import type { Paginated, Package as PackageDto, PipelineTriggerAction } from '@chaotic-next/shared-lib';
import { AuthGuard } from '@thallesp/nestjs-better-auth';
import { Builder, Package, Repo } from '../builder/builder.entity';
import { ArchlinuxPackage } from '../repo-manager/repo-manager.entity';
import { AdminService, PKG_TYPE_ARCH, PKG_TYPE_CHAOTIC } from './admin.service';
import type { CreateArchPackageBody, CreatePackageBody, CreateRepoBody } from './admin.service';

class MrActionDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  mergeRequestIid!: number;

  @ApiProperty()
  action!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  userName!: string;

  @ApiProperty()
  createdAt!: string;
}

class PipelineTriggerDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  ref!: string;

  @ApiProperty()
  operation!: string;

  @ApiProperty({ type: Object })
  inputs!: Record<string, string>;

  @ApiProperty({ required: false })
  pipelineId?: number;

  @ApiProperty({ required: false })
  webUrl?: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  userName!: string;

  @ApiProperty()
  createdAt!: string;
}

class PackageBumpDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  bumpType!: number;

  @ApiProperty()
  trigger!: number;

  @ApiProperty()
  triggerFrom!: number;

  @ApiProperty({ type: String, isArray: true, required: false })
  details?: string[];

  @ApiProperty()
  timestamp!: string;

  @ApiProperty({ required: false })
  pkgname?: string;

  @ApiProperty({ required: false })
  triggerName?: string;
}

class AdminPackageElfAnalysisDto {
  @ApiProperty()
  id!: number;

  @ApiProperty({ enum: [PKG_TYPE_ARCH, PKG_TYPE_CHAOTIC] })
  pkgType!: '0' | '1';

  @ApiProperty()
  pkgId!: number;

  @ApiProperty({ required: false })
  pkgname?: string;

  @ApiProperty()
  version!: string;

  @ApiProperty()
  broken!: boolean;

  @ApiProperty({ type: String, isArray: true })
  brokenReasons!: string[];

  @ApiProperty()
  scannedAt!: string;
}

class CreateBuilderBodyDto {
  @ApiProperty()
  name!: string;

  @ApiProperty({ required: false })
  description?: string;

  @ApiProperty({ required: false })
  builderClass?: string;

  @ApiProperty({ required: false })
  isActive?: boolean;
}

class CreateElfAnalysisBodyDto {
  @ApiProperty({ enum: [PKG_TYPE_ARCH, PKG_TYPE_CHAOTIC] })
  pkgType!: '0' | '1';

  @ApiProperty()
  pkgId!: number;

  @ApiProperty()
  version!: string;

  @ApiProperty({ required: false })
  broken?: boolean;

  @ApiProperty({ type: String, isArray: true, required: false })
  brokenReasons?: string[];
}

@ApiTags('admin')
@UseGuards(AuthGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('packages')
  @ApiOperation({ summary: 'List packages (admin)' })
  @ApiOkResponse({ description: 'Paginated list of packages' })
  async listPackages(
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('perPage', new ParseIntPipe({ optional: true })) perPage?: number,
    @Query('q') q?: string,
    @Query('repoId', new ParseIntPipe({ optional: true })) repoId?: number,
    @Query('active') active?: string,
  ): Promise<Paginated<PackageDto>> {
    return this.adminService.listPackages(
      page,
      perPage,
      q,
      repoId,
      active === undefined ? undefined : active === 'true',
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
  async listArchPackages(
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('perPage', new ParseIntPipe({ optional: true })) perPage?: number,
    @Query('q') q?: string,
  ): Promise<Paginated<ArchlinuxPackage>> {
    return this.adminService.listArchPackages(page, perPage, q);
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
  listRepos(): Promise<Repo[]> {
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
  async listBuilders(
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('perPage', new ParseIntPipe({ optional: true })) perPage?: number,
    @Query('q') q?: string,
    @Query('active') active?: string,
  ): Promise<Paginated<Builder>> {
    return this.adminService.listBuilders(page, perPage, q, active === undefined ? undefined : active === 'true');
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
  async listMrActions(
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('perPage', new ParseIntPipe({ optional: true })) perPage?: number,
    @Query('q') q?: string,
    @Query('action') action?: string,
  ): Promise<Paginated<MrActionDto>> {
    return this.adminService.listMrActions(page, perPage, q, action);
  }

  @Get('pipeline-triggers')
  @ApiOperation({ summary: 'List triggered pipelines (admin)' })
  @ApiOkResponse({ description: 'Paginated list of triggered pipelines', type: PipelineTriggerDto, isArray: true })
  async listPipelineTriggers(
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('perPage', new ParseIntPipe({ optional: true })) perPage?: number,
    @Query('q') q?: string,
    @Query('operation') operation?: string,
  ): Promise<Paginated<PipelineTriggerAction>> {
    return this.adminService.listPipelineTriggers(page, perPage, q, operation);
  }

  @Get('package-bumps')
  @ApiOperation({ summary: 'List package bumps (admin)' })
  @ApiOkResponse({ description: 'Paginated list of package bumps', type: PackageBumpDto, isArray: true })
  async listPackageBumps(
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('perPage', new ParseIntPipe({ optional: true })) perPage?: number,
    @Query('q') q?: string,
    @Query('bumpType', new ParseIntPipe({ optional: true })) bumpType?: number,
    @Query('triggerFrom', new ParseIntPipe({ optional: true })) triggerFrom?: number,
  ): Promise<Paginated<PackageBumpDto>> {
    return this.adminService.listPackageBumps(page, perPage, q, bumpType, triggerFrom);
  }

  @Get('package-elf-analysis')
  @ApiOperation({ summary: 'List package ELF analysis rows (admin)' })
  @ApiOkResponse({
    description: 'Paginated list of package ELF analysis rows',
    type: AdminPackageElfAnalysisDto,
    isArray: true,
  })
  async listElfAnalysis(
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('perPage', new ParseIntPipe({ optional: true })) perPage?: number,
    @Query('q') q?: string,
    @Query('pkgType') pkgType?: string,
    @Query('broken') broken?: string,
  ): Promise<Paginated<AdminPackageElfAnalysisDto>> {
    return this.adminService.listElfAnalysis(
      page,
      perPage,
      q,
      pkgType === undefined || (pkgType !== PKG_TYPE_ARCH && pkgType !== PKG_TYPE_CHAOTIC) ? undefined : pkgType,
      broken === undefined ? undefined : broken === 'true',
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
}
