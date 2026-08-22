import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDefined, IsEnum, IsInt, IsObject, IsOptional, IsString } from 'class-validator';
import { PKG_TYPE_ARCH, PKG_TYPE_CHAOTIC } from '@chaotic-next/shared-lib';

export class MrActionDto {
  @ApiProperty({ description: 'Record ID' })
  @IsInt()
  id!: number;

  @ApiProperty({ description: 'Merge request IID' })
  @IsInt()
  mergeRequestIid!: number;

  @ApiPropertyOptional({ description: 'Commit hash the action was performed on' })
  @IsOptional()
  @IsString()
  commitSha?: string | null;

  @ApiProperty({ description: 'Action performed on the merge request' })
  @IsString()
  action!: string;

  @ApiProperty({ description: 'ID of the user who performed the action' })
  @IsString()
  userId!: string;

  @ApiProperty({ description: 'Name of the user who performed the action' })
  @IsString()
  userName!: string;

  @ApiProperty({ description: 'When the action was performed (ISO 8601)' })
  @IsString()
  createdAt!: string;
}

export class PipelineTriggerDto {
  @ApiProperty({ description: 'Record ID' })
  @IsInt()
  id!: number;

  @ApiProperty({ description: 'Git ref the pipeline was triggered on' })
  @IsString()
  ref!: string;

  @ApiPropertyOptional({ description: 'Commit hash the pipeline was triggered on' })
  @IsOptional()
  @IsString()
  commitSha?: string | null;

  @ApiProperty({ description: 'Pipeline operation name' })
  @IsString()
  operation!: string;

  @ApiProperty({ description: 'Inputs passed to the pipeline', type: Object })
  @IsDefined()
  @IsObject()
  inputs!: Record<string, string>;

  @ApiPropertyOptional({ description: 'GitLab pipeline ID' })
  @IsOptional()
  @IsInt()
  pipelineId?: number;

  @ApiPropertyOptional({ description: 'URL of the triggered pipeline' })
  @IsOptional()
  @IsString()
  webUrl?: string;

  @ApiProperty({ description: 'ID of the user who triggered the pipeline' })
  @IsString()
  userId!: string;

  @ApiProperty({ description: 'Name of the user who triggered the pipeline' })
  @IsString()
  userName!: string;

  @ApiProperty({ description: 'When the pipeline was triggered (ISO 8601)' })
  @IsString()
  createdAt!: string;
}

export class PackageBumpDto {
  @ApiProperty({ description: 'Record ID' })
  @IsInt()
  id!: number;

  @ApiProperty({ description: 'Bump type ID' })
  @IsInt()
  bumpType!: number;

  @ApiProperty({ description: 'ID of the package that triggered the bump' })
  @IsInt()
  trigger!: number;

  @ApiProperty({ description: 'Origin of the trigger (0 for Arch, 1 for Chaotic)' })
  @IsInt()
  triggerFrom!: number;

  @ApiPropertyOptional({ description: 'Details of the bump', type: String, isArray: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  details?: string[];

  @ApiProperty({ description: 'When the bump happened (ISO 8601)' })
  @IsString()
  timestamp!: string;

  @ApiPropertyOptional({ description: 'Name of the bumped package' })
  @IsOptional()
  @IsString()
  pkgname?: string;

  @ApiPropertyOptional({ description: 'Name of the triggering package' })
  @IsOptional()
  @IsString()
  triggerName?: string;
}

export class AdminPackageElfAnalysisDto {
  @ApiProperty({ description: 'Record ID' })
  @IsInt()
  id!: number;

  @ApiProperty({ description: 'Package type (0 for Arch, 1 for Chaotic)', enum: [PKG_TYPE_ARCH, PKG_TYPE_CHAOTIC] })
  @IsEnum([PKG_TYPE_ARCH, PKG_TYPE_CHAOTIC])
  pkgType!: '0' | '1';

  @ApiProperty({ description: 'ID of the analysed package' })
  @IsInt()
  pkgId!: number;

  @ApiPropertyOptional({ description: 'Name of the analysed package' })
  @IsOptional()
  @IsString()
  pkgname?: string;

  @ApiProperty({ description: 'Version of the analysed package' })
  @IsString()
  version!: string;

  @ApiProperty({ description: 'Whether the package was flagged broken' })
  @IsBoolean()
  broken!: boolean;

  @ApiProperty({ description: 'Reasons the package was flagged broken', type: String, isArray: true })
  @IsArray()
  @IsString({ each: true })
  brokenReasons!: string[];

  @ApiProperty({ description: 'When the package was scanned (ISO 8601)' })
  @IsString()
  scannedAt!: string;
}

export class CreateBuilderBodyDto {
  @ApiProperty({ description: 'Builder name' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ description: 'Builder description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Builder class' })
  @IsOptional()
  @IsString()
  builderClass?: string;

  @ApiPropertyOptional({ description: 'Whether the builder is active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateElfAnalysisBodyDto {
  @ApiProperty({ description: 'Package type (0 for Arch, 1 for Chaotic)', enum: [PKG_TYPE_ARCH, PKG_TYPE_CHAOTIC] })
  @IsEnum([PKG_TYPE_ARCH, PKG_TYPE_CHAOTIC])
  pkgType!: '0' | '1';

  @ApiProperty({ description: 'ID of the analysed package' })
  @IsInt()
  pkgId!: number;

  @ApiProperty({ description: 'Version of the analysed package' })
  @IsString()
  version!: string;

  @ApiPropertyOptional({ description: 'Whether the package is flagged broken' })
  @IsOptional()
  @IsBoolean()
  broken?: boolean;

  @ApiPropertyOptional({ description: 'Reasons the package is flagged broken', type: String, isArray: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  brokenReasons?: string[];
}

export class ListAdminPackagesQueryDto {
  @ApiPropertyOptional({ description: 'Page number, 1-based' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number;

  @ApiPropertyOptional({ description: 'Rows per page' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  perPage?: number;

  @ApiPropertyOptional({ description: 'Search query matching pkgname' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Filter packages by repository id' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  repoId?: number;

  @ApiPropertyOptional({ description: 'Filter active status ("true" or "false")' })
  @IsOptional()
  @IsString()
  active?: string;
}

export class ListArchPackagesQueryDto {
  @ApiPropertyOptional({ description: 'Page number, 1-based' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number;

  @ApiPropertyOptional({ description: 'Rows per page' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  perPage?: number;

  @ApiPropertyOptional({ description: 'Search query matching pkgname' })
  @IsOptional()
  @IsString()
  q?: string;
}

export class ListBuildersQueryDto {
  @ApiPropertyOptional({ description: 'Page number, 1-based' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number;

  @ApiPropertyOptional({ description: 'Rows per page' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  perPage?: number;

  @ApiPropertyOptional({ description: 'Search query matching builder name' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Filter active status ("true" or "false")' })
  @IsOptional()
  @IsString()
  active?: string;
}

export class ListMrActionsQueryDto {
  @ApiPropertyOptional({ description: 'Page number, 1-based' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number;

  @ApiPropertyOptional({ description: 'Rows per page' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  perPage?: number;

  @ApiPropertyOptional({ description: 'Search query matching MR action details' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Filter by action type' })
  @IsOptional()
  @IsString()
  action?: string;
}

export class ListPipelineTriggersQueryDto {
  @ApiPropertyOptional({ description: 'Page number, 1-based' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number;

  @ApiPropertyOptional({ description: 'Rows per page' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  perPage?: number;

  @ApiPropertyOptional({ description: 'Search query matching pipeline trigger details' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Filter by operation type' })
  @IsOptional()
  @IsString()
  operation?: string;
}

export class ListPackageBumpsQueryDto {
  @ApiPropertyOptional({ description: 'Page number, 1-based' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number;

  @ApiPropertyOptional({ description: 'Rows per page' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  perPage?: number;

  @ApiPropertyOptional({ description: 'Search query matching package bump details' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Filter by bump type ID' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  bumpType?: number;

  @ApiPropertyOptional({ description: 'Filter by trigger origin ID' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  triggerFrom?: number;
}

export class ListElfAnalysisQueryDto {
  @ApiPropertyOptional({ description: 'Page number, 1-based' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number;

  @ApiPropertyOptional({ description: 'Rows per page' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  perPage?: number;

  @ApiPropertyOptional({ description: 'Search query matching package ELF analysis' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Filter by package type ("0" for Arch, "1" for Chaotic)' })
  @IsOptional()
  @IsString()
  pkgType?: string;

  @ApiPropertyOptional({ description: 'Filter broken status ("true" or "false")' })
  @IsOptional()
  @IsString()
  broken?: string;
}

export class RescanPackageItemDto {
  @ApiProperty({ description: 'Package name' })
  @IsString()
  pkgname!: string;

  @ApiProperty({ description: 'Package type: "0" for Arch, "1" for Chaotic' })
  @IsString()
  pkgType!: string;
}

export class RescanPackagesDto {
  @ApiProperty({ description: 'Packages to rescan', type: [RescanPackageItemDto], isArray: true })
  @IsArray()
  @Type(() => RescanPackageItemDto)
  packages!: RescanPackageItemDto[];
}
