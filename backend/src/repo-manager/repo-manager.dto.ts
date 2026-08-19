import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class BumpPackagesBodyDto {
  @ApiProperty({
    description: 'Package names to manually bump',
    type: String,
    isArray: true,
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  pkgnames!: string[];
}

export class BumpPackagesResultDto {
  @ApiProperty({
    description: 'Package names that were actually bumped and committed',
    type: String,
    isArray: true,
  })
  @IsArray()
  @IsString({ each: true })
  bumped!: string[];
}
