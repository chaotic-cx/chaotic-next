import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDefined, IsEnum, IsInt, IsObject, IsOptional, IsString } from 'class-validator';
import { PKG_TYPE_ARCH, PKG_TYPE_CHAOTIC } from './admin.service';

export class MrActionDto {
  @ApiProperty()
  @IsInt()
  id!: number;

  @ApiProperty()
  @IsInt()
  mergeRequestIid!: number;

  @ApiProperty()
  @IsString()
  action!: string;

  @ApiProperty()
  @IsString()
  userId!: string;

  @ApiProperty()
  @IsString()
  userName!: string;

  @ApiProperty()
  @IsString()
  createdAt!: string;
}

export class PipelineTriggerDto {
  @ApiProperty()
  @IsInt()
  id!: number;

  @ApiProperty()
  @IsString()
  ref!: string;

  @ApiProperty()
  @IsString()
  operation!: string;

  @ApiProperty({ type: Object })
  @IsDefined()
  @IsObject()
  inputs!: Record<string, string>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  pipelineId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  webUrl?: string;

  @ApiProperty()
  @IsString()
  userId!: string;

  @ApiProperty()
  @IsString()
  userName!: string;

  @ApiProperty()
  @IsString()
  createdAt!: string;
}

export class PackageBumpDto {
  @ApiProperty()
  @IsInt()
  id!: number;

  @ApiProperty()
  @IsInt()
  bumpType!: number;

  @ApiProperty()
  @IsInt()
  trigger!: number;

  @ApiProperty()
  @IsInt()
  triggerFrom!: number;

  @ApiPropertyOptional({ type: String, isArray: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  details?: string[];

  @ApiProperty()
  @IsString()
  timestamp!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pkgname?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  triggerName?: string;
}

export class AdminPackageElfAnalysisDto {
  @ApiProperty()
  @IsInt()
  id!: number;

  @ApiProperty({ enum: [PKG_TYPE_ARCH, PKG_TYPE_CHAOTIC] })
  @IsEnum([PKG_TYPE_ARCH, PKG_TYPE_CHAOTIC])
  pkgType!: '0' | '1';

  @ApiProperty()
  @IsInt()
  pkgId!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pkgname?: string;

  @ApiProperty()
  @IsString()
  version!: string;

  @ApiProperty()
  @IsBoolean()
  broken!: boolean;

  @ApiProperty({ type: String, isArray: true })
  @IsArray()
  @IsString({ each: true })
  brokenReasons!: string[];

  @ApiProperty()
  @IsString()
  scannedAt!: string;
}

export class CreateBuilderBodyDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  builderClass?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateElfAnalysisBodyDto {
  @ApiProperty({ enum: [PKG_TYPE_ARCH, PKG_TYPE_CHAOTIC] })
  @IsEnum([PKG_TYPE_ARCH, PKG_TYPE_CHAOTIC])
  pkgType!: '0' | '1';

  @ApiProperty()
  @IsInt()
  pkgId!: number;

  @ApiProperty()
  @IsString()
  version!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  broken?: boolean;

  @ApiPropertyOptional({ type: String, isArray: true })
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
