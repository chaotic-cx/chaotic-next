import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CountryStatsDto {
  @ApiProperty()
  @IsString()
  country!: string;

  @ApiProperty()
  @IsString()
  count!: string;
}

export class MirrorStatsDto {
  @ApiProperty()
  @IsString()
  mirror!: string;

  @ApiProperty()
  @IsString()
  count!: string;
}

export class PackageStatsDto {
  @ApiProperty()
  @IsString()
  pkgbase!: string;

  @ApiProperty()
  @IsString()
  count!: string;
}

export class PerDayStatsDto {
  @ApiProperty()
  @IsString()
  day!: string;

  @ApiProperty()
  @IsString()
  count!: string;
}
