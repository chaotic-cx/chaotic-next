import { GitlabLogChunk } from '@chaotic-next/shared-lib';
import {
  Controller,
  NotFoundException,
  Param,
  ParseIntPipe,
  Query,
  ServiceUnavailableException,
  Sse,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';

const DEFAULT_RESUME_OFFSET = 0;

@ApiTags('logs')
@Controller('logs')
export class PackageLogsController {
  constructor(private readonly configService: ConfigService) {}

  @Sse(':pkgname/:timestamp')
  @ApiOperation({ summary: 'Stream a package build log from the build server.' })
  @ApiOkResponse({ description: 'Stream of GitlabLogChunk messages', type: Object })
  @ApiQuery({ name: 'offset', required: false, description: 'Resume from this character offset', type: Number })
  getPackageLog(
    @Param('pkgname') pkgname: string,
    @Param('timestamp') timestamp: string,
    @Query('offset', new ParseIntPipe({ optional: true })) offset = DEFAULT_RESUME_OFFSET,
  ): Observable<Partial<MessageEvent<GitlabLogChunk>>> {
    const base = this.configService.getOrThrow<string>('app.garudaLogsUrl');
    const url = `${base}/${encodeURIComponent(pkgname)}/${encodeURIComponent(timestamp)}`;
    const resumeAt = offset > DEFAULT_RESUME_OFFSET ? offset : DEFAULT_RESUME_OFFSET;
    return new Observable((subscriber) => {
      // Aborting on teardown cancels the upstream fetch so a disconnecting
      // client does not leave the build-server connection dangling.
      const upstream = new AbortController();

      const stream = async (): Promise<void> => {
        try {
          const response = await fetch(url, { signal: upstream.signal });
          if (response.status === 404) throw new NotFoundException('Build log not found');
          if (!response.ok || !response.body) throw new ServiceUnavailableException('Could not fetch build log');

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          // Chunks report an absolute cumulative character offset so a resumed
          // client can reconnect again without receiving duplicates; start the
          // count at the resume point.
          let offset = resumeAt;
          // Discard the already-streamed prefix so a resumed client does not
          // receive duplicate log lines. Resume is expressed in characters, not
          // bytes, to match the offset the chunks report.
          let remainingToSkip = resumeAt;
          while (!upstream.signal.aborted) {
            const { done, value } = await reader.read();
            if (done) break;
            let text = decoder.decode(value, { stream: true });
            if (remainingToSkip > 0) {
              if (text.length <= remainingToSkip) {
                remainingToSkip -= text.length;
                continue;
              }
              text = text.slice(remainingToSkip);
              remainingToSkip = 0;
            }
            if (text) {
              offset += text.length;
              subscriber.next({ data: { offset, text, complete: false, status: '' } });
            }
          }
          subscriber.next({ data: { offset, text: '', complete: true, status: '' } });
        } catch (error) {
          if (!upstream.signal.aborted) subscriber.error(error);
        } finally {
          subscriber.complete();
        }
      };

      void stream();
      return () => upstream.abort();
    });
  }
}
