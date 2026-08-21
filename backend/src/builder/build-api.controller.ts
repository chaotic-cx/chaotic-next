import {
  Body,
  Controller,
  Logger,
  NotFoundException,
  Post,
  Query,
  ServiceUnavailableException,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBody, ApiCookieAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@thallesp/nestjs-better-auth';
import { Observable } from 'rxjs';
import { PromoteDto, ScheduleDto } from './build-api.dto';
import { parseManagerLogEvent } from './manager-log-parser';

@ApiTags('build-api')
@ApiCookieAuth('better-auth.session_token')
@UseGuards(AuthGuard)
@Controller('api')
export class BuildApiController {
  private readonly logger = new Logger(BuildApiController.name);

  constructor(private readonly configService: ConfigService) {}

  private get buildServerUrl(): string {
    return this.configService.getOrThrow<string>('app.buildServerUrl');
  }

  private get managerApiToken(): string | undefined {
    return this.configService.get<string | undefined>('app.managerApiToken');
  }

  private get authHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = this.managerApiToken;
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  @Post('queue/schedule')
  @ApiOperation({ summary: 'Proxy a schedule request to the build server.' })
  @ApiBody({ type: ScheduleDto })
  @ApiOkResponse({ description: 'Schedule response' })
  async schedulePackages(@Body() body: ScheduleDto): Promise<unknown> {
    const url = `${this.buildServerUrl}/queue/schedule`;
    return this.proxyPostJson(url, body);
  }

  @Post('queue/promote')
  @ApiOperation({ summary: 'Proxy a promote request to the build server.' })
  @ApiBody({ type: PromoteDto })
  @ApiOkResponse({ description: 'Promote response' })
  async promotePackage(@Body() body: PromoteDto): Promise<unknown> {
    const url = `${this.buildServerUrl}/queue/promote`;
    return this.proxyPostJson(url, body);
  }

  @Sse('manager/logs')
  @ApiOperation({ summary: 'Proxy manager log stream from the build server as server-sent events.' })
  @ApiOkResponse({ description: 'SSE stream of manager logs' })
  @ApiQuery({ name: 'Last-Event-ID', required: false, description: 'Sequence number to resume from', type: Number })
  getManagerLogs(@Query('Last-Event-ID') lastEventId?: number): Observable<Partial<MessageEvent<string>>> {
    const url = `${this.buildServerUrl}/manager/logs`;
    return new Observable((subscriber) => {
      const upstream = new AbortController();

      const stream = async (): Promise<void> => {
        try {
          const headers: Record<string, string> = {};
          const token = this.managerApiToken;
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }
          if (lastEventId !== undefined) {
            headers['Last-Event-ID'] = String(lastEventId);
          }
          const response = await fetch(url, { signal: upstream.signal, headers });
          if (!response.ok || !response.body) throw new ServiceUnavailableException('Could not fetch manager logs');

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (!upstream.signal.aborted) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const events = buffer.split('\n\n');
            buffer = events.pop() ?? '';

            for (const event of events) {
              const dataLine = event.split('\n').find((line) => line.startsWith('data: '));
              if (!dataLine) continue;
              const msg = parseManagerLogEvent(dataLine);
              if (msg) {
                subscriber.next({ data: msg });
              }
            }
          }
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

  private async proxyPostJson(url: string, body: unknown): Promise<unknown> {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.authHeaders,
        body: JSON.stringify(body),
      });
      if (response.status === 404) throw new NotFoundException('Resource not found on build server');
      if (!response.ok) throw new ServiceUnavailableException(`Build server returned ${response.status}`);
      const text = await response.text();
      return text ? (JSON.parse(text) as unknown) : {};
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ServiceUnavailableException) throw error;
      this.logger.error(`Proxy POST JSON failed: ${url}`, error);
      throw new ServiceUnavailableException('Could not reach build server');
    }
  }
}
