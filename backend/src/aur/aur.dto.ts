import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';
import { MAX_QUERY_LENGTH, MIN_QUERY_LENGTH } from '../utils/constants';

export class AurSuggestionsQueryDto {
  @ApiPropertyOptional({ description: 'Search term for matching AUR package names' })
  @IsOptional()
  @IsString()
  @Length(MIN_QUERY_LENGTH, MAX_QUERY_LENGTH)
  q?: string;
}
