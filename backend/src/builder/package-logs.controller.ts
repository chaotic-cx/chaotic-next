import { Controller, Get, Header, NotFoundException, Param, Res, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('logs')
@Controller('logs')
export class PackageLogsController {
  constructor(private readonly configService: ConfigService) {}

  @Get(':pkgname/:timestamp')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @ApiOperation({ summary: 'Proxy a package build log (ANSI) from the build server.' })
  @ApiOkResponse({ description: 'Raw build log' })
  async getPackageLog(
    @Param('pkgname') pkgname: string,
    @Param('timestamp') timestamp: string,
    @Res() res: { send: (stream: unknown) => void },
  ): Promise<void> {
    const base = this.configService.getOrThrow<string>('app.garudaLogsUrl');
    const response = await fetch(`${base}/${encodeURIComponent(pkgname)}/${encodeURIComponent(timestamp)}`);

    if (response.status === 404) {
      throw new NotFoundException('Build log not found');
    }
    if (!response.ok || !response.body) {
      throw new ServiceUnavailableException('Could not fetch build log');
    }

    res.send(response.body);
  }
}
