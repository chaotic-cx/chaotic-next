import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@thallesp/nestjs-better-auth';
import { MAX_QUERY_LENGTH, MIN_QUERY_LENGTH } from '../utils/constants';
import { AurSuggestionsQueryDto } from './aur.dto';
import { AurService } from './aur.service';

@ApiTags('aur')
@ApiCookieAuth('better-auth.session_token')
@UseGuards(AuthGuard)
@Controller('aur')
export class AurController {
  constructor(private readonly aurService: AurService) {}

  @Get('suggestions')
  @ApiOperation({ summary: 'Get AUR package name suggestions for a search term.' })
  @ApiOkResponse({ description: 'List of matching AUR package names', type: String, isArray: true })
  async getSuggestions(@Query() query: AurSuggestionsQueryDto): Promise<string[]> {
    const q = query.q;
    if (q === undefined || q.length < MIN_QUERY_LENGTH || q.length > MAX_QUERY_LENGTH) {
      throw new BadRequestException(`q must be ${MIN_QUERY_LENGTH}-${MAX_QUERY_LENGTH} characters long`);
    }
    return await this.aurService.getSuggestions(q.trim());
  }
}
