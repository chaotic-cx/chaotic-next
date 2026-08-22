import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';

export class SchedulePackageDto {
  @ApiProperty({ description: 'Package base name' })
  @IsString()
  pkgbase!: string;

  @ApiPropertyOptional({ description: 'Build class (number or string)' })
  @IsOptional()
  build_class?: number | string;

  @ApiPropertyOptional({ description: 'Package names', type: String, isArray: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  pkgnames?: string[];

  @ApiPropertyOptional({ description: 'Dependencies', type: String, isArray: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dependencies?: string[];
}

export class ScheduleBuildDto {
  @ApiProperty({ description: 'Package names to schedule', type: String, isArray: true })
  @ArrayNotEmpty()
  @IsString({ each: true })
  packages!: string[];

  @ApiPropertyOptional({ description: 'Source repository name' })
  @IsOptional()
  @IsString()
  source_repo?: string;

  @ApiPropertyOptional({ description: 'Target repository name' })
  @IsOptional()
  @IsString()
  target_repo?: string;
}

export class ScheduleDto {
  @ApiPropertyOptional({ description: 'Target architecture' })
  @IsOptional()
  @IsString()
  arch?: string;

  @ApiPropertyOptional({ description: 'Source repository name' })
  @IsOptional()
  @IsString()
  source_repo?: string;

  @ApiPropertyOptional({ description: 'Target repository name' })
  @IsOptional()
  @IsString()
  target_repo?: string;

  @ApiPropertyOptional({ description: 'Commit hash' })
  @IsOptional()
  @IsString()
  commit?: string;

  @ApiProperty({ description: 'Packages to schedule', type: [SchedulePackageDto], isArray: true })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SchedulePackageDto)
  packages!: SchedulePackageDto[];

  @ApiPropertyOptional({ description: 'Arch mirror URL' })
  @IsOptional()
  @IsString()
  arch_mirror?: string;
}

export class PromoteDto {
  @ApiProperty({ description: 'Package base name' })
  @IsString()
  pkgbase!: string;

  @ApiProperty({ description: 'Target architecture' })
  @IsString()
  arch!: string;

  @ApiProperty({ description: 'Target repository name' })
  @IsString()
  target_repo!: string;
}
