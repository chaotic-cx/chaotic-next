import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';

export class AurScanBodyDto {
  @ApiProperty({ description: 'AUR package name to scan' })
  @IsString()
  @IsNotEmpty()
  package!: string;
}

export class ApproveMrDto {
  @ApiProperty({ description: 'Merge request IID' })
  @IsInt()
  @Min(1)
  iid!: number;

  @ApiProperty({ description: 'Git commit SHA' })
  @IsString()
  @Matches(/^[0-9a-fA-F]{6,40}$/)
  sha!: string;
}

export class ApproveMrResponseDto {
  @ApiProperty({
    description: 'Whether the merge request was merged directly or deferred until after scheduled pipeline',
  })
  deferred!: boolean;
}

export class FlagMrDto {
  @ApiProperty({ description: 'Merge request IID' })
  @IsInt()
  @Min(1)
  iid!: number;

  @ApiProperty({ description: 'Flag label (dangerous or hold)', enum: ['dangerous', 'hold'] })
  @IsString()
  @IsIn(['dangerous', 'hold'])
  label!: 'dangerous' | 'hold';
}

export class BumpPackagesDto {
  @ApiProperty({
    description: 'List of package names to bump',
    type: [String],
    isArray: true,
    example: ['nodejs', 'hplip'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  packages!: string[];

  @ApiProperty({ description: 'Repository name', example: 'chaotic-aur' })
  @IsString()
  repo!: string;

  @ApiPropertyOptional({ description: 'Git ref', example: 'main' })
  @IsOptional()
  @IsString()
  ref?: string;
}

export class AddPackageItemDto {
  @ApiProperty({ description: 'Package name', example: 'paru' })
  @IsString()
  @IsNotEmpty()
  pkgname!: string;

  @ApiPropertyOptional({ description: 'Source type or URL', example: 'aur' })
  @IsOptional()
  @IsString()
  source?: string;
}

export class AddPackagesDto {
  @ApiProperty({ description: 'List of packages to add', type: AddPackageItemDto, isArray: true })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => AddPackageItemDto)
  packages!: AddPackageItemDto[];

  @ApiProperty({ description: 'Repository name', example: 'chaotic-aur' })
  @IsString()
  repo!: string;

  @ApiProperty({ description: 'Request origin', example: 'github/5678' })
  @IsString()
  @IsNotEmpty()
  request_origin!: string;

  @ApiPropertyOptional({ description: 'Request reason', example: 'request' })
  @IsOptional()
  @IsString()
  request_reason?: string;

  @ApiPropertyOptional({ description: 'Custom request reason' })
  @IsOptional()
  @IsString()
  custom_request_reason?: string;

  @ApiPropertyOptional({ description: 'Git ref', example: 'main' })
  @IsOptional()
  @IsString()
  ref?: string;
}

export class DropPackagesDto {
  @ApiProperty({
    description: 'List of package names to drop',
    type: String,
    isArray: true,
    example: ['paru', 'zen-browser'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  packages!: string[];

  @ApiProperty({ description: 'Repository name', example: 'chaotic-aur' })
  @IsString()
  repo!: string;

  @ApiPropertyOptional({ description: 'Git ref', example: 'main' })
  @IsOptional()
  @IsString()
  ref?: string;
}

export class RunScheduleDto {
  @ApiProperty({ description: 'Pipeline schedule ID', example: 12 })
  @IsInt()
  @Min(1)
  scheduleId!: number;
}

export class TriggerPipelineDto {
  @ApiProperty({ description: 'Pipeline operation name', example: 'bump-packages' })
  @IsString()
  operation!: string;

  @ApiPropertyOptional({ description: 'Git ref', example: 'main' })
  @IsOptional()
  @IsString()
  ref?: string;

  @ApiPropertyOptional({ description: 'Packages to bump', example: 'nodejs' })
  @IsOptional()
  @IsString()
  packages?: string;

  @ApiPropertyOptional({ description: 'Trigger name' })
  @IsOptional()
  @IsString()
  trigger?: string;

  @ApiPropertyOptional({ description: 'Add packages list (e.g., paru/aur)', example: 'paru/aur' })
  @IsOptional()
  @IsString()
  add_packages?: string;

  @ApiPropertyOptional({ description: 'Request origin identifier', example: 'github/5678' })
  @IsOptional()
  @IsString()
  request_origin?: string;

  @ApiPropertyOptional({ description: 'Request reason (optional)', example: 'request' })
  @IsOptional()
  @IsString()
  request_reason?: string;

  @ApiPropertyOptional({ description: 'Custom request reason (optional)' })
  @IsOptional()
  @IsString()
  custom_request_reason?: string;
}
