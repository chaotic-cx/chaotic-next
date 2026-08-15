import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';

export class UserAgentMetricDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsInt()
  count!: number;
}

export class CountNameDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsInt()
  count!: number;
}

export class SpecificPackageMetricsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty()
  @IsInt()
  downloads!: number;

  @ApiProperty({ type: UserAgentMetricDto, isArray: true })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UserAgentMetricDto)
  user_agents!: UserAgentMetricDto[];
}

export class MetricsQueryDto {
  @ApiPropertyOptional({ description: 'Number of days to look back' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  days?: number;
}
