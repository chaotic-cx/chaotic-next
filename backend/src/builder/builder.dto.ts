import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { BuildStatus } from '@chaotic-next/shared-lib';

export class GetPackagesQueryDto {
  @ApiPropertyOptional({ description: 'Add repo information to the result' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  repo?: boolean = false;

  @ApiPropertyOptional({ description: 'Filter packages by repository id' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  repoId?: number;

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

  @ApiPropertyOptional({ description: 'Search query matching pkgname, description or URL' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Sort field (pkgname, lastUpdated, version, repo)' })
  @IsOptional()
  @IsString()
  sort?: string;

  @ApiPropertyOptional({ description: 'Sort order (ASC or DESC)' })
  @IsOptional()
  @IsString()
  order?: string;
}

export class GetBuildsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by builder name' })
  @IsOptional()
  @IsString()
  builder?: string;

  @ApiPropertyOptional({ description: 'Filter by repository name' })
  @IsOptional()
  @IsString()
  repo?: string;

  @ApiPropertyOptional({ description: 'Filter by build status', enum: BuildStatus, enumName: 'BuildStatus' })
  @IsOptional()
  @Type(() => Number)
  @IsEnum(BuildStatus)
  status?: BuildStatus;

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

  @ApiPropertyOptional({ description: 'Search query matching pkgname, builder, repo or commit' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Sort field (id, timestamp, timeToEnd, pkgname, builder, repo, status)' })
  @IsOptional()
  @IsString()
  sort?: string;

  @ApiPropertyOptional({ description: 'Sort order (ASC or DESC)' })
  @IsOptional()
  @IsString()
  order?: string;
}

export class GetLatestBuildsQueryDto {
  @ApiPropertyOptional({ description: 'Amount to return' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  amount?: number = 50;

  @ApiPropertyOptional({ description: 'Offset for pagination' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  offset?: number = 0;

  @ApiPropertyOptional({ description: 'Build status', enum: BuildStatus, enumName: 'BuildStatus' })
  @IsOptional()
  @Type(() => Number)
  @IsEnum(BuildStatus)
  status?: BuildStatus;
}
