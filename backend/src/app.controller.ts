import { Controller, Get, Header } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('app')
@Controller()
export class AppController {
  @Get()
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @ApiOperation({ summary: 'Greet with the deployed backend version' })
  @ApiOkResponse({ description: 'Plain-text version greeting', type: String })
  hello(): string {
    return `Hello from chaotic-backend v${__VERSION__}`;
  }
}
