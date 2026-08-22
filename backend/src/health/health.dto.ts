import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { Allow, IsArray, IsNumber, IsObject, IsOptional, IsString } from 'class-validator';

export class HealthCheckResultDto {
  @ApiProperty({ description: 'Overall health status', enum: ['ok', 'error'] })
  @IsString()
  status!: 'ok' | 'error';

  @ApiPropertyOptional({ description: 'Information from healthy indicators', type: Object })
  @IsOptional()
  @IsObject()
  info?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Errors from unhealthy indicators', type: Object })
  @IsOptional()
  @IsObject()
  error?: Record<string, unknown>;

  @ApiProperty({ description: 'Details from all health indicators', type: Object })
  @IsObject()
  details!: Record<string, unknown>;
}

export class BrokenPackageReportDto {
  @ApiProperty({ description: 'Package type (always "chaotic" for broken reports)', enum: ['chaotic'] })
  @IsString()
  pkgType!: string;
  @ApiProperty({ description: 'Package name' }) @IsString() pkgname!: string;
  @ApiProperty({ description: 'Package version' }) @IsString() version!: string;
  @ApiPropertyOptional({ description: 'Repository name' }) @IsOptional() @IsString() repoName?: string;
  @ApiProperty({ description: 'Reasons the package is flagged broken', type: String, isArray: true })
  @IsArray()
  @IsString({ each: true })
  reasons!: string[];
}

export class RebuildTriggerSourcePackageDto {
  @ApiProperty({ description: 'Package name' }) @IsString() pkgname!: string;
  @ApiProperty({ description: 'Package type', enum: ['arch', 'chaotic'] }) @IsString() pkgType!: string;
}

export class SonameDependencyDto {
  @ApiProperty({ description: 'Shared object name (soname)' }) @IsString() soname!: string;
  @ApiProperty({
    description: 'Packages that provide this soname',
    type: RebuildTriggerSourcePackageDto,
    isArray: true,
  })
  @IsArray()
  @Type(() => RebuildTriggerSourcePackageDto)
  providers!: RebuildTriggerSourcePackageDto[];
}

export class ExplicitTriggerDto {
  @ApiProperty({ description: 'Package name listed in CI_REBUILD_TRIGGERS' }) @IsString() pkgname!: string;
  @ApiProperty({ description: 'Arch version of the trigger package' }) @IsString() archVersion!: string;
}

export class PackageRebuildTriggerSourcesDto {
  @ApiProperty({ description: 'Package name' }) @IsString() pkgname!: string;
  @ApiProperty({ description: 'Explicit rebuild triggers from .CI/config', type: ExplicitTriggerDto, isArray: true })
  @IsArray()
  @Type(() => ExplicitTriggerDto)
  explicitTriggers!: ExplicitTriggerDto[];
  @ApiProperty({ description: 'Soname-based dependency links', type: SonameDependencyDto, isArray: true })
  @IsArray()
  @Type(() => SonameDependencyDto)
  sonameDependencies!: SonameDependencyDto[];
  @ApiProperty({
    description: 'Packages this package is a plugin of',
    type: RebuildTriggerSourcePackageDto,
    isArray: true,
  })
  @IsArray()
  @Type(() => RebuildTriggerSourcePackageDto)
  pluginOwners!: RebuildTriggerSourcePackageDto[];
}

export class DependencyNodeDto {
  @ApiProperty({ description: 'Package type', enum: ['0', '1'] }) @IsString() pkgType!: string;
  @ApiProperty({ description: 'Package ID' }) @IsNumber() pkgId!: number;
  @ApiProperty({ description: 'Package name' }) @IsString() pkgname!: string;
  @ApiProperty({ description: 'Sonames this package provides', type: String, isArray: true })
  @IsArray()
  @IsString({ each: true })
  providedSonames!: string[];
  @ApiProperty({ description: 'Sonames this package links against', type: String, isArray: true })
  @IsArray()
  @IsString({ each: true })
  neededSonames!: string[];
}

export class DependencyEdgeDto {
  @ApiProperty({ description: 'The consuming package (links the soname)', type: DependencyNodeDto })
  @Type(() => DependencyNodeDto)
  @Allow()
  consumer!: DependencyNodeDto;
  @ApiProperty({ description: 'The providing package (ships the soname)', type: DependencyNodeDto })
  @Type(() => DependencyNodeDto)
  @Allow()
  provider!: DependencyNodeDto;
  @ApiProperty({ description: 'Shared object name linking consumer to provider' }) @IsString() soname!: string;
}
