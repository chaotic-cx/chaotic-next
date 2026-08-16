import { Controller, NotFoundException, Param, ServiceUnavailableException, Sse } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GitlabLogChunk } from '@chaotic-next/shared-lib';
import { Observable } from 'rxjs';

@ApiTags('logs')
@Controller('logs')
export class PackageLogsController {
  constructor(private readonly configService: ConfigService) {}

  @Sse(':pkgname/:timestamp')
  @ApiOperation({ summary: 'Stream a package build log (ANSI) from the build server.' })
  @ApiOkResponse({ description: 'Stream of GitlabLogChunk messages', type: Object })
  getPackageLog(
    @Param('pkgname') pkgname: string,
    @Param('timestamp') timestamp: string,
  ): Observable<Partial<MessageEvent<GitlabLogChunk>>> {
    const base = this.configService.getOrThrow<string>('app.garudaLogsUrl');
    const url = `${base}/${encodeURIComponent(pkgname)}/${encodeURIComponent(timestamp)}`;
    return new Observable((subscriber) => {
      let running = true;

      const stop = (): void => {
        if (!running) return;
        running = false;
        subscriber.complete();
      };

      const stream = async (): Promise<void> => {
        try {
          const response = await fetch(url);
          if (response.status === 404) throw new NotFoundException('Build log not found');
          if (!response.ok || !response.body) throw new ServiceUnavailableException('Could not fetch build log');

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let offset = 0;
          while (running) {
            const { done, value } = await reader.read();
            if (done) break;
            const text = decoder.decode(value, { stream: true });
            if (text) {
              offset += text.length;
              subscriber.next({ data: { offset, text, complete: false, status: '' } });
            }
          }
          subscriber.next({ data: { offset, text: '', complete: true, status: '' } });
          stop();
        } catch (error) {
          subscriber.error(error);
          stop();
        }
      };

      void stream();
      return () => stop();
    });
  }
}
