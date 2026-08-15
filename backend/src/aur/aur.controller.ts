import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AurService } from './aur.service';

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 100;

@ApiTags('aur')
@Controller('aur')
export class AurController {
  constructor(private readonly aurService: AurService) {}

  @Get('suggestions')
  @ApiOperation({ summary: 'Get AUR package name suggestions for a search term.' })
  @ApiOkResponse({ description: 'List of matching AUR package names', isArray: true })
  async getSuggestions(@Query('q') q?: string): Promise<string[]> {
    if (q === undefined || q.length < MIN_QUERY_LENGTH || q.length > MAX_QUERY_LENGTH) {
      throw new BadRequestException(`q must be ${MIN_QUERY_LENGTH}-${MAX_QUERY_LENGTH} characters long`);
    }
    return await this.aurService.getSuggestions(q.trim());
  }
}
