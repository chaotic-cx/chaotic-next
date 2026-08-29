import { schemaResponse, schemaResponseArray } from '../api/response-schema';
import { BuildClassSyncService } from '../builder/build-class-sync.service';
import { Builder, Package, Repo } from '../builder/builder.entity';
import { ArchlinuxPackage } from '../repo-manager/repo-manager.entity';
import { AdminService, type CreateArchPackageBody, type CreatePackageBody, type CreateRepoBody } from './admin.service';
import {
  adminPackageElfAnalysisSchema,
  archPackageSchema,
  builderSchema,
  createBuilderBodySchema,
  createElfAnalysisBodySchema,
  createRepoBodySchema,
  idParamSchema,
  listAdminPackagesQuerySchema,
  listArchPackagesQuerySchema,
  listBuildersQuerySchema,
  listElfAnalysisQuerySchema,
  listMrActionsQuerySchema,
  listPackageBumpsQuerySchema,
  listPipelineTriggersQuerySchema,
  mrActionSchema,
  packageBumpSchema,
  packageSchema,
  pipelineTriggerActionSchema,
  PKG_TYPE_ARCH,
  PKG_TYPE_CHAOTIC,
  repoSchema,
  rescanJobSchema,
  rescanPackagesBodySchema,
  rescanStartedSchema,
  type AdminPackageElfAnalysis,
  type CreateBuilderBodyDto,
  type CreateElfAnalysisBodyDto,
  type ListAdminPackagesQueryDto,
  type ListArchPackagesQueryDto,
  type ListBuildersQueryDto,
  type ListElfAnalysisQueryDto,
  type ListMrActionsQueryDto,
  type ListPackageBumpsQueryDto,
  type ListPipelineTriggersQueryDto,
  type MrAction,
  type Package as PackageDto,
  type PackageBump,
  type Paginated,
  type PipelineTriggerAction,
  type RescanJob,
  type RescanPackagesDto,
  updateArchPackageBodySchema,
  updatePackageBodySchema,
} from '@chaotic-next/shared-lib';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
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
import { AuthGuard } from '@thallesp/nestjs-better-auth';

@ApiTags('admin')
@ApiCookieAuth('better-auth.session_token')
@UseGuards(AuthGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly buildClassSync: BuildClassSyncService,
  ) {}

  @Post('rescan-build-classes')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Re-read the build class of every active package from its .CI/config.' })
  @ApiAcceptedResponse({ description: 'Build class rescan triggered; runs in the background.' })
  rescanBuildClasses(): void {
    void this.buildClassSync.rescanAllPackages();
  }

  @Post('recompute-signal-derivations')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Rebuild the signal directory index, every pluginOf derivation, and the broken flags.',
  })
  @ApiAcceptedResponse({ description: 'Signal derivation recompute triggered; runs in the background.' })
  recomputeSignalDerivations(): void {
    this.adminService.startSignalDerivationRecompute();
  }

  @Get('packages')
  @ApiOperation({ summary: 'List packages (admin)' })
  @ApiOkResponse({ description: 'Paginated list of packages', schema: schemaResponse(packageSchema).schema })
  async listPackages(
    @Query({ schema: listAdminPackagesQuerySchema }) query: ListAdminPackagesQueryDto,
  ): Promise<Paginated<PackageDto>> {
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
  @ApiOkResponse({ description: 'The updated package', schema: schemaResponse(packageSchema).schema })
  updatePackage(
    @Param('id', { schema: idParamSchema }) id: number,
    @Body({ schema: updatePackageBodySchema.partial() }) body: Partial<CreatePackageBody>,
  ): Promise<Package> {
    return this.adminService.updatePackage(id, body);
  }

  @Delete('packages/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a package' })
  @ApiNoContentResponse({ description: 'Package deleted' })
  deletePackage(@Param('id', { schema: idParamSchema }) id: number): Promise<void> {
    return this.adminService.deletePackage(id);
  }

  @Get('arch-packages')
  @ApiOperation({ summary: 'List Arch packages (admin)' })
  @ApiOkResponse({ description: 'Paginated list of Arch packages', schema: schemaResponse(archPackageSchema).schema })
  async listArchPackages(
    @Query({ schema: listArchPackagesQuerySchema }) query: ListArchPackagesQueryDto,
  ): Promise<Paginated<ArchlinuxPackage>> {
    return this.adminService.listArchPackages(query.page, query.perPage, query.q);
  }

  @Patch('arch-packages/:id')
  @ApiOperation({ summary: 'Update an Arch package' })
  @ApiOkResponse({ description: 'The updated Arch package', schema: schemaResponse(archPackageSchema).schema })
  updateArchPackage(
    @Param('id', { schema: idParamSchema }) id: number,
    @Body({ schema: updateArchPackageBodySchema.partial() }) body: Partial<CreateArchPackageBody>,
  ): Promise<ArchlinuxPackage> {
    return this.adminService.updateArchPackage(id, body);
  }

  @Delete('arch-packages/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an Arch package' })
  @ApiNoContentResponse({ description: 'Arch package deleted' })
  deleteArchPackage(@Param('id', { schema: idParamSchema }) id: number): Promise<void> {
    return this.adminService.deleteArchPackage(id);
  }

  @Get('repos')
  @ApiOperation({ summary: 'List repos (admin)' })
  @ApiOkResponse({ description: 'List of repos', schema: schemaResponseArray(repoSchema).schema })
  async listRepos(): Promise<Repo[]> {
    return this.adminService.listRepos();
  }

  @Post('repos')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a repo' })
  @ApiCreatedResponse({ description: 'The created repo', schema: schemaResponse(repoSchema).schema })
  createRepo(@Body({ schema: createRepoBodySchema }) body: CreateRepoBody): Promise<Repo> {
    return this.adminService.createRepo(body);
  }

  @Patch('repos/:id')
  @ApiOperation({ summary: 'Update a repo' })
  @ApiOkResponse({ description: 'The updated repo', schema: schemaResponse(repoSchema).schema })
  updateRepo(
    @Param('id', { schema: idParamSchema }) id: number,
    @Body({ schema: createRepoBodySchema.partial() }) body: Partial<CreateRepoBody>,
  ): Promise<Repo> {
    return this.adminService.updateRepo(id, body);
  }

  @Delete('repos/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a repo' })
  @ApiNoContentResponse({ description: 'Repo deleted' })
  deleteRepo(@Param('id', { schema: idParamSchema }) id: number): Promise<void> {
    return this.adminService.deleteRepo(id);
  }

  @Get('builders')
  @ApiOperation({ summary: 'List builders (admin)' })
  @ApiOkResponse({ description: 'Paginated list of builders', schema: schemaResponse(builderSchema).schema })
  async listBuilders(
    @Query({ schema: listBuildersQuerySchema }) query: ListBuildersQueryDto,
  ): Promise<Paginated<Builder>> {
    return this.adminService.listBuilders(
      query.page,
      query.perPage,
      query.q,
      query.active === undefined ? undefined : query.active === 'true',
    );
  }

  @Post('builders')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a builder' })
  @ApiCreatedResponse({ description: 'The created builder', schema: schemaResponse(builderSchema).schema })
  createBuilder(@Body({ schema: createBuilderBodySchema }) body: CreateBuilderBodyDto): Promise<Builder> {
    return this.adminService.createBuilder(body);
  }

  @Patch('builders/:id')
  @ApiOperation({ summary: 'Update a builder' })
  @ApiOkResponse({ description: 'The updated builder', schema: schemaResponse(builderSchema).schema })
  updateBuilder(
    @Param('id', { schema: idParamSchema }) id: number,
    @Body({ schema: createBuilderBodySchema.partial() }) body: Partial<CreateBuilderBodyDto>,
  ): Promise<Builder> {
    return this.adminService.updateBuilder(id, body);
  }

  @Delete('builders/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a builder' })
  @ApiNoContentResponse({ description: 'Builder deleted' })
  deleteBuilder(@Param('id', { schema: idParamSchema }) id: number): Promise<void> {
    return this.adminService.deleteBuilder(id);
  }

  @Get('mr-actions')
  @ApiOperation({ summary: 'List merge-request actions (admin)' })
  @ApiOkResponse({ description: 'Paginated list of MR actions', schema: schemaResponseArray(mrActionSchema).schema })
  async listMrActions(
    @Query({ schema: listMrActionsQuerySchema }) query: ListMrActionsQueryDto,
  ): Promise<Paginated<MrAction>> {
    return this.adminService.listMrActions(query.page, query.perPage, query.q, query.action);
  }

  @Get('pipeline-triggers')
  @ApiOperation({ summary: 'List triggered pipelines (admin)' })
  @ApiOkResponse({
    description: 'Paginated list of triggered pipelines',
    schema: schemaResponseArray(pipelineTriggerActionSchema).schema,
  })
  async listPipelineTriggers(
    @Query({ schema: listPipelineTriggersQuerySchema }) query: ListPipelineTriggersQueryDto,
  ): Promise<Paginated<PipelineTriggerAction>> {
    return this.adminService.listPipelineTriggers(query.page, query.perPage, query.q, query.operation);
  }

  @Get('package-bumps')
  @ApiOperation({ summary: 'List package bumps (admin)' })
  @ApiOkResponse({
    description: 'Paginated list of package bumps',
    schema: schemaResponseArray(packageBumpSchema).schema,
  })
  async listPackageBumps(
    @Query({ schema: listPackageBumpsQuerySchema }) query: ListPackageBumpsQueryDto,
  ): Promise<Paginated<PackageBump>> {
    return this.adminService.listPackageBumps(query.page, query.perPage, query.q, query.bumpType, query.triggerFrom);
  }

  @Get('package-elf-analysis')
  @ApiOperation({ summary: 'List package ELF analysis rows (admin)' })
  @ApiOkResponse({
    description: 'Paginated list of package ELF analysis rows',
    schema: schemaResponseArray(adminPackageElfAnalysisSchema).schema,
  })
  async listElfAnalysis(
    @Query({ schema: listElfAnalysisQuerySchema }) query: ListElfAnalysisQueryDto,
  ): Promise<Paginated<AdminPackageElfAnalysis>> {
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
  @ApiOkResponse({
    description: 'Rebuild-trigger bumps for the ELF analysis row',
    schema: schemaResponseArray(packageBumpSchema).schema,
  })
  listElfAnalysisBumps(@Param('id', { schema: idParamSchema }) id: number): Promise<PackageBump[]> {
    return this.adminService.listElfAnalysisBumps(id);
  }

  @Patch('package-elf-analysis/:id')
  @ApiOperation({ summary: 'Update a package ELF analysis row' })
  @ApiOkResponse({
    description: 'The updated package ELF analysis row',
    schema: schemaResponse(adminPackageElfAnalysisSchema).schema,
  })
  updateElfAnalysis(
    @Param('id', { schema: idParamSchema }) id: number,
    @Body({ schema: createElfAnalysisBodySchema.partial() }) body: Partial<CreateElfAnalysisBodyDto>,
  ): Promise<AdminPackageElfAnalysis> {
    return this.adminService.updateElfAnalysis(id, body);
  }

  @Delete('package-elf-analysis/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a package ELF analysis row' })
  @ApiNoContentResponse({ description: 'Package ELF analysis row deleted' })
  deleteElfAnalysis(@Param('id', { schema: idParamSchema }) id: number): Promise<void> {
    return this.adminService.deleteElfAnalysis(id);
  }

  @Post('rescan')
  @ApiOperation({ summary: 'Start a background ELF signal rescan for packages by name.' })
  @ApiOkResponse({
    description: 'Rescan accepted for background processing',
    schema: schemaResponse(rescanStartedSchema).schema,
  })
  startRescan(@Body({ schema: rescanPackagesBodySchema }) body: RescanPackagesDto): { started: number; jobId: string } {
    return this.adminService.startRescanPackages(body.packages);
  }

  @Get('rescan/:jobId')
  @ApiParam({ name: 'jobId', description: 'Rescan job id returned by POST /admin/rescan' })
  @ApiOperation({ summary: 'Status and outcome of a background ELF signal rescan job.' })
  @ApiOkResponse({ description: 'The rescan job state', schema: schemaResponse(rescanJobSchema).schema })
  getRescanStatus(@Param('jobId') jobId: string): RescanJob {
    return this.adminService.getRescanJob(jobId);
  }
}
