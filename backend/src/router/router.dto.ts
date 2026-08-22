import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CountryStatsDto {
  @ApiProperty({ description: 'Country of the router hit' })
  @IsString()
  country!: string;

  @ApiProperty({ description: 'Number of hits' })
  @IsString()
  count!: string;
}

export class MirrorStatsDto {
  @ApiProperty({ description: 'Mirror hostname' })
  @IsString()
  mirror!: string;

  @ApiProperty({ description: 'Number of hits' })
  @IsString()
  count!: string;
}

export class PackageStatsDto {
  @ApiProperty({ description: 'Package base name' })
  @IsString()
  pkgbase!: string;

  @ApiProperty({ description: 'Number of hits' })
  @IsString()
  count!: string;
}

export class PerDayStatsDto {
  @ApiProperty({ description: 'Day (YYYY-MM-DD)' })
  @IsString()
  day!: string;

  @ApiProperty({ description: 'Number of hits' })
  @IsString()
  count!: string;
}

export class MirrorOverTimeDto {
  @ApiProperty({ description: 'Day (YYYY-MM-DD)' })
  @IsString()
  day!: string;

  @ApiProperty({ description: 'Mirror hostname' })
  @IsString()
  mirror!: string;

  @ApiProperty({ description: 'Number of downloads' })
  @IsString()
  count!: string;
}

export class CountryOverTimeDto {
  @ApiProperty({ description: 'Day (YYYY-MM-DD)' })
  @IsString()
  day!: string;

  @ApiProperty({ description: 'Country code' })
  @IsString()
  country!: string;

  @ApiProperty({ description: 'Number of downloads' })
  @IsString()
  count!: string;
}

export class UserAgentTrendDto {
  @ApiProperty({ description: 'Day (YYYY-MM-DD)' })
  @IsString()
  day!: string;

  @ApiProperty({ description: 'User agent string' })
  @IsString()
  userAgent!: string;

  @ApiProperty({ description: 'Number of downloads' })
  @IsString()
  count!: string;
}
