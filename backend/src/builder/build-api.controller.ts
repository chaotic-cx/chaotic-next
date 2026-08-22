import {
  BadRequestException,
  Body,
  Controller,
  Headers,
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
import { SkipThrottle } from '@nestjs/throttler';
import { AuthGuard } from '@thallesp/nestjs-better-auth';
import { Observable } from 'rxjs';
import { GitlabService } from '../gitlab/gitlab.service';
import { withSseKeepalive, type SseMessage } from '../utils/sse';
import { PromoteDto, ScheduleBuildDto, ScheduleDto } from './build-api.dto';
import { parseManagerLogEvent } from './manager-log-parser';

const PROXY_REQUEST_TIMEOUT_MS = 15_000;

@ApiTags('build-api')
@ApiCookieAuth('better-auth.session_token')
@UseGuards(AuthGuard)
@Controller('api')
export class BuildApiController {
  private readonly logger = new Logger(BuildApiController.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly gitlabService: GitlabService,
  ) {}

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
  @ApiOperation({ summary: 'Schedule a package build via the build server.' })
  @ApiBody({ type: ScheduleBuildDto })
  @ApiOkResponse({ description: 'Schedule response' })
  async schedulePackages(@Body() body: ScheduleBuildDto): Promise<unknown> {
    const sourceRepo = body.source_repo ?? 'chaotic-aur';
    const targetRepo = body.target_repo ?? sourceRepo;
    const commit = await this.fetchHeadCommit(sourceRepo);
    if (!commit) {
      throw new BadRequestException(`Could not determine HEAD commit for ${sourceRepo}`);
    }
    const scheduleBody: ScheduleDto = {
      arch: 'x86_64',
      source_repo: sourceRepo,
      target_repo: targetRepo,
      commit,
      packages: body.packages.map((pkgbase: string) => ({ pkgbase })),
    };
    const url = `${this.buildServerUrl}/queue/schedule`;
    this.logger.log(
      `Scheduling ${scheduleBody.packages.map((p) => p.pkgbase).join(', ')} → ${targetRepo} (source: ${sourceRepo}, commit: ${commit ?? 'N/A'})`,
    );
    return this.proxyPostJson(url, scheduleBody);
  }

  private async fetchHeadCommit(repoName: string): Promise<string | undefined> {
    try {
      return await this.gitlabService.getHeadCommitForRepo(repoName);
    } catch {
      this.logger.warn(`Could not fetch HEAD commit for ${repoName}, proceeding without it`);
      return undefined;
    }
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
  @SkipThrottle()
  @ApiOperation({ summary: 'Proxy manager log stream from the build server as server-sent events.' })
  @ApiOkResponse({ description: 'SSE stream of manager logs' })
  @ApiQuery({ name: 'lastEventId', required: false, description: 'Sequence number to resume from', type: Number })
  getManagerLogs(
    @Query('lastEventId') lastEventId?: number,
    // Native EventSource reconnects replay the last received frame id here.
    @Headers('last-event-id') lastEventIdHeader?: string,
  ): Observable<SseMessage<string>> {
    const url = `${this.buildServerUrl}/manager/logs`;
    const resumeFrom = lastEventId ?? (Number(lastEventIdHeader) || undefined);
    return withSseKeepalive(
      new Observable<SseMessage<string>>((subscriber) => {
        const upstream = new AbortController();
        let sequence = 0;

        const stream = async (): Promise<void> => {
          try {
            const headers: Record<string, string> = {};
            const token = this.managerApiToken;
            if (token) {
              headers['Authorization'] = `Bearer ${token}`;
            }
            if (resumeFrom !== undefined && Number.isInteger(resumeFrom)) {
              headers['Last-Event-ID'] = String(resumeFrom);
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
                const lines = event.split('\n');
                const dataLine = lines.find((line) => line.startsWith('data: '));
                if (!dataLine) continue;
                const msg = parseManagerLogEvent(dataLine);
                if (msg) {
                  sequence += 1;
                  subscriber.next({ id: String(sequence), data: msg });
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
      }),
    );
  }

  private async proxyPostJson(url: string, body: unknown): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROXY_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.authHeaders,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (response.status === 404) throw new NotFoundException('Resource not found on build server');
      if (!response.ok) throw new ServiceUnavailableException(`Build server returned ${response.status}`);
      const text = await response.text();
      return text ? (JSON.parse(text) as unknown) : {};
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ServiceUnavailableException) throw error;
      this.logger.error(`Proxy POST JSON failed: ${url}`, error);
      throw new ServiceUnavailableException('Could not reach build server');
    } finally {
      clearTimeout(timeout);
    }
  }
}
