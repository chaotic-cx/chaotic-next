import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';

export class UserAgentMetricDto {
  @ApiProperty({ description: 'User agent string' })
  @IsString()
  name!: string;

  @ApiProperty({ description: 'Number of requests from this user agent' })
  @IsInt()
  count!: number;
}

export class RpsHistorySampleDto {
  @ApiProperty({ description: 'Unix timestamp in milliseconds' })
  @IsInt()
  timestamp!: number;

  @ApiProperty({ description: 'Requests during that second' })
  @IsInt()
  requests!: number;
}

export class CountNameDto {
  @ApiProperty({ description: 'Name (e.g. country or package)' })
  @IsString()
  name!: string;

  @ApiProperty({ description: 'Number of hits' })
  @IsInt()
  count!: number;
}

export class SpecificPackageMetricsDto {
  @ApiPropertyOptional({ description: 'Package name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ description: 'Number of downloads' })
  @IsInt()
  downloads!: number;

  @ApiProperty({ description: 'User agent breakdown for the package', type: UserAgentMetricDto, isArray: true })
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

  @ApiPropertyOptional({ description: 'Optional repo to filter metrics for' })
  @IsOptional()
  @IsString()
  repo?: string;
}

export class LiveTrafficHitDto {
  @ApiProperty({ description: 'Unique hit event id' })
  @IsString()
  id!: string;

  @ApiProperty({ description: 'Timestamp (epoch ms)' })
  @IsInt()
  timestamp!: number;

  @ApiProperty({ description: 'Client two-letter ISO country code' })
  @IsString()
  countryCode!: string;

  @ApiProperty({ description: 'Client hashed identity' })
  @IsString()
  userHash!: string;

  @ApiProperty({ description: 'Repository or distro' })
  @IsString()
  repo!: string;

  @ApiProperty({ description: 'HTTP status code' })
  @IsInt()
  statusCode!: number;

  @ApiProperty({ description: 'User-Agent header' })
  @IsString()
  userAgent!: string;

  @ApiProperty({ description: 'Target mirror hostname' })
  @IsString()
  hostname!: string;

  @ApiProperty({ description: 'Routing worker instance' })
  @IsString()
  worker!: string;
}
