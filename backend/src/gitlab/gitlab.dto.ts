import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Min } from 'class-validator';

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

export class TriggerPipelineDto {
  @ApiProperty({ description: 'Pipeline operation name', example: 'Bump Packages' })
  @IsString()
  operation!: string;

  @ApiPropertyOptional({ description: 'Git ref', example: 'main' })
  @IsOptional()
  @IsString()
  ref?: string;

  @ApiPropertyOptional({ description: 'Packages to bump', example: 'nodejs:20' })
  @IsOptional()
  @IsString()
  packages?: string;

  @ApiPropertyOptional({ description: 'Trigger name' })
  @IsOptional()
  @IsString()
  trigger?: string;

  @ApiPropertyOptional({ description: 'Packages to add', example: 'paru/aur' })
  @IsOptional()
  @IsString()
  add_packages?: string;

  @ApiPropertyOptional({ description: 'Request origin', example: 'github/5678' })
  @IsOptional()
  @IsString()
  request_origin?: string;

  @ApiPropertyOptional({ description: 'Request reason', example: 'request' })
  @IsOptional()
  @IsString()
  request_reason?: string;

  @ApiPropertyOptional({ description: 'Custom request reason' })
  @IsOptional()
  @IsString()
  custom_request_reason?: string;
}
