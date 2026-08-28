import { GitlabPipelineService } from '../gitlab/gitlab-pipeline.service';
import { errorMessage } from '../utils/functions';
import { type SseMessage, withSseKeepalive } from '../utils/sse';
import { BuildClassSuggesterService } from './build-class-suggester.service';
import { parseManagerLogEvent } from './manager-log-parser';
import {
  promoteBodySchema,
  scheduleBuildBodySchema,
  type BuildClassSuggestion,
  type PromoteDto,
  type ScheduleBuildDto,
  type ScheduleDto,
  type SchedulePackageDto,
} from '@chaotic-next/shared-lib';
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
import { ApiCookieAuth, ApiHeaders, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { AuthGuard } from '@thallesp/nestjs-better-auth';
import { Observable } from 'rxjs';

const PROXY_REQUEST_TIMEOUT_MS = 15_000;
const MANAGER_LOG_BUFFER_FRAMES = 500;

interface ProxySseClient<T> {
  next: (message: SseMessage<T>) => void;
  complete: () => void;
  error: (err: unknown) => void;
}

@ApiTags('build-api')
@ApiCookieAuth('better-auth.session_token')
@UseGuards(AuthGuard)
@Controller('api')
export class BuildApiController {
  private readonly logger = new Logger(BuildApiController.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly gitlabPipelineService: GitlabPipelineService,
    private readonly buildClassSuggester: BuildClassSuggesterService,
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
  @ApiOkResponse({ description: 'Schedule response' })
  async schedulePackages(@Body({ schema: scheduleBuildBodySchema }) body: ScheduleBuildDto): Promise<unknown> {
    const sourceRepo = body.source_repo ?? 'chaotic-aur';
    const targetRepo = body.target_repo ?? sourceRepo;
    const commit = await this.fetchHeadCommit(sourceRepo);
    if (!commit) {
      throw new BadRequestException(`Could not determine HEAD commit for ${sourceRepo}`, {
        errorCode: 'HEAD_COMMIT_UNKNOWN',
      });
    }
    const scheduleBody: ScheduleDto = {
      arch: 'x86_64',
      source_repo: sourceRepo,
      target_repo: targetRepo,
      commit,
      packages: await this.withSuggestedBuildClasses(body.packages),
    };
    const url = `${this.buildServerUrl}/queue/schedule`;
    this.logger.log(
      `Scheduling ${scheduleBody.packages.map((p) => p.pkgbase).join(', ')} → ${targetRepo} (source: ${sourceRepo}, commit: ${commit ?? 'N/A'})`,
    );
    return this.proxyPostJson(url, scheduleBody);
  }

  private async fetchHeadCommit(repoName: string): Promise<string | undefined> {
    try {
      return await this.gitlabPipelineService.getHeadCommitForRepo(repoName);
    } catch {
      this.logger.warn(`Could not fetch HEAD commit for ${repoName}, proceeding without it`);
      return undefined;
    }
  }

  private async withSuggestedBuildClasses(pkgbases: string[]): Promise<SchedulePackageDto[]> {
    let suggestions: BuildClassSuggestion[] = [];
    try {
      suggestions = await this.buildClassSuggester.suggestForPackages(pkgbases);
    } catch (err) {
      this.logger.warn(`Build class suggestion failed, scheduling without classes: ${errorMessage(err)}`);
    }
    const classByPkgbase = new Map(
      suggestions.map((suggestion) => [suggestion.pkgname, suggestion.suggestedBuildClass]),
    );
    return pkgbases.map((pkgbase) => ({
      pkgbase,
      build_class: classByPkgbase.get(pkgbase) ?? undefined,
    }));
  }

  @Post('queue/promote')
  @ApiOperation({ summary: 'Proxy a promote request to the build server.' })
  @ApiOkResponse({ description: 'Promote response' })
  async promotePackage(@Body({ schema: promoteBodySchema }) body: PromoteDto): Promise<unknown> {
    const url = `${this.buildServerUrl}/queue/promote`;
    return this.proxyPostJson(url, body);
  }

  @Sse('manager/logs')
  @ApiHeaders([
    { name: 'last-event-id', required: false, description: 'Native EventSource reconnect: last received frame id' },
  ])
  @SkipThrottle()
  @ApiOperation({ summary: 'Proxy manager log stream from the build server as server-sent events.' })
  @ApiOkResponse({ description: 'SSE stream of manager logs' })
  @ApiQuery({ name: 'lastEventId', required: false, description: 'Sequence number to resume from', type: Number })
  getManagerLogs(
    @Query('lastEventId') lastEventId?: number,
    // Native EventSource reconnects replay the last received frame id here.
    @Headers('last-event-id') lastEventIdHeader?: string,
  ): Observable<SseMessage<string>> {
    const resumeFrom = lastEventId ?? (Number(lastEventIdHeader) || undefined);
    return withSseKeepalive(
      new Observable<SseMessage<string>>((subscriber) => {
        const client: ProxySseClient<string> & { resumeFrom?: number } = {
          resumeFrom,
          next: (message) => subscriber.next(message),
          complete: () => subscriber.complete(),
          error: (err) => subscriber.error(err),
        };
        this.addManagerLogClient(client);
        return () => this.removeManagerLogClient(client);
      }),
    );
  }

  /**
   * One shared upstream connection feeds every manager-log viewer; recent frames
   * are buffered so reconnecting clients can resume without re-fetching.
   */
  private readonly managerLogClients = new Set<ProxySseClient<string> & { resumeFrom?: number }>();
  private readonly managerLogBuffer: SseMessage<string>[] = [];
  private managerLogSequence = 0;
  private managerLogsUpstream: AbortController | undefined;

  private addManagerLogClient(client: ProxySseClient<string> & { resumeFrom?: number }): void {
    this.managerLogClients.add(client);
    for (const frame of this.managerLogBuffer) {
      if (client.resumeFrom === undefined || Number(frame.id) > client.resumeFrom) client.next(frame);
    }
    if (!this.managerLogsUpstream) void this.streamManagerLogs();
  }

  private removeManagerLogClient(client: ProxySseClient<string> & { resumeFrom?: number }): void {
    this.managerLogClients.delete(client);
    if (this.managerLogClients.size === 0) this.managerLogsUpstream?.abort();
  }

  private broadcastManagerLogFrame(message: string): void {
    this.managerLogSequence += 1;
    const frame: SseMessage<string> = { id: String(this.managerLogSequence), data: message };
    this.managerLogBuffer.push(frame);
    if (this.managerLogBuffer.length > MANAGER_LOG_BUFFER_FRAMES) this.managerLogBuffer.shift();

    for (const client of [...this.managerLogClients]) client.next(frame);
  }

  private async streamManagerLogs(): Promise<void> {
    const upstream = new AbortController();
    this.managerLogsUpstream = upstream;

    try {
      const headers: Record<string, string> = {};
      const token = this.managerApiToken;
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const response = await fetch(`${this.buildServerUrl}/manager/logs`, { signal: upstream.signal, headers });
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
          const message = parseManagerLogEvent(dataLine);
          if (message !== undefined) this.broadcastManagerLogFrame(message);
        }
      }
    } catch (error) {
      if (!upstream.signal.aborted) {
        for (const client of [...this.managerLogClients]) client.error(error);
      }
    } finally {
      upstream.abort();
      for (const client of [...this.managerLogClients]) client.complete();
      this.managerLogClients.clear();
      this.managerLogsUpstream = undefined;
    }
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
