import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class SchedulePackageDto {
  @ApiProperty({ description: 'Package base name' })
  @IsString()
  pkgbase!: string;

  @ApiPropertyOptional({ description: 'Build class' })
  @IsOptional()
  @IsNumber()
  build_class?: number;

  @ApiPropertyOptional({ description: 'Package names', type: [String], isArray: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  pkgnames?: string[];

  @ApiPropertyOptional({ description: 'Dependencies', type: [String], isArray: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dependencies?: string[];
}

export class ScheduleDto {
  @ApiProperty({ description: 'Target architecture' })
  @IsString()
  arch!: string;

  @ApiProperty({ description: 'Source repository name' })
  @IsString()
  source_repo!: string;

  @ApiProperty({ description: 'Target repository name' })
  @IsString()
  target_repo!: string;

  @ApiProperty({ description: 'Commit hash' })
  @IsString()
  commit!: string;

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
