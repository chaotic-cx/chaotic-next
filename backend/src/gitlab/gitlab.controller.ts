import { schemaResponse, schemaResponseArray } from '../api/response-schema';
import { auth } from '../auth/auth';
import { GITLAB_GROUP_CHAOTIC_AUR } from '../auth/gitlab-groups';
import { RequireGroups, RequireRepoGroup } from '../decorators/require-groups.decorator';
import { AurScanService } from '../diff-scan/aur-scan.service';
import { RequireGroupGuard } from '../guards/require-group.guard';
import {
  AUR_SCAN_THROTTLE_LIMIT,
  AUR_SCAN_THROTTLE_TTL_MS,
  AUR_SEARCH_THROTTLE_LIMIT,
  EXTERNAL_PROXY_THROTTLE_TTL_MS,
  PIPELINE_JOBS_THROTTLE_LIMIT,
} from '../utils/constants';
import { type SseMessage } from '../utils/sse';
import { GitlabApiService } from './gitlab-api.service';
import { GitlabJobTraceService } from './gitlab-job-trace.service';
import { GitlabMergeRequestService } from './gitlab-merge-request.service';
import { GitlabPackageOpsService } from './gitlab-package-ops.service';
import { GitlabPipelineService } from './gitlab-pipeline.service';
import { validatePipelineTriggerInputs } from './pipeline-trigger-inputs';
import {
  addPackagesBodySchema,
  approveMrBodySchema,
  approveMrResponseSchema,
  AurPackageScan,
  aurPackageScanSchema,
  aurScanBodySchema,
  AurScanStreamChunk,
  aurSearchQuerySchema,
  bumpPackagesGitlabBodySchema,
  daysQuerySchema,
  dropPackagesBodySchema,
  flagMrBodySchema,
  GitlabJob,
  gitlabIdParamSchema,
  gitlabJobSchema,
  GitlabLogChunk,
  gitlabWebhookBodySchema,
  MergeRequestWithDiffs,
  mergeRequestWithDiffsSchema,
  offsetQuerySchema,
  type GitlabWebhookBodyDto,
  PipelineScheduleOption,
  pipelineScheduleOptionSchema,
  PipelineTriggerResult,
  pipelineTriggerResultSchema,
  PipelineWithExternalStatus,
  pipelineWithExternalStatusSchema,
  reviewStatsOverTimeSchema,
  reviewStatsSchema,
  runScheduleBodySchema,
  schedulesQuerySchema,
  triggerPipelineBodySchema,
  type AddPackagesDto,
  type ApproveMrDto,
  type ApproveMrResponse as ApproveMrResponseShared,
  type AurScanBodyDto,
  type AurSearchQueryDto,
  type BumpPackagesDto,
  type DaysQueryDto,
  type DropPackagesDto,
  type FlagMrDto,
  type RunScheduleDto,
  type SchedulesQueryDto,
  type TriggerPipelineDto,
} from '@chaotic-next/shared-lib';
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  RawBodyRequest,
  Req,
  Sse,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeaders,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiParam,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { AuthGuard, OptionalAuth, Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { Observable } from 'rxjs';

function verifyStandardWebhookSignature(
  signingToken: string,
  messageId: string,
  timestamp: string,
  body: string,
  receivedSignatures: string,
): boolean {
  const rawKey = Buffer.from(signingToken.replace(/^whsec_/, ''), 'base64');
  const message = `${messageId}.${timestamp}.${body}`;
  const digest = createHmac('sha256', rawKey).update(message).digest();
  const expected = `v1,${digest.toString('base64')}`;
  return receivedSignatures.split(' ').some((sig) => {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

@ApiTags('gitlab')
@Controller('gitlab')
export class GitlabController {
  WEBHOOK_TOKEN: string;
  WEBHOOK_SIGNING_TOKEN: string | undefined;

  constructor(
    private readonly configService: ConfigService,
    private readonly gitlabApiService: GitlabApiService,
    private readonly gitlabMergeRequestService: GitlabMergeRequestService,
    private readonly gitlabPipelineService: GitlabPipelineService,
    private readonly gitlabJobTraceService: GitlabJobTraceService,
    private readonly gitlabPackageOpsService: GitlabPackageOpsService,
    private readonly aurScanService: AurScanService,
  ) {
    this.WEBHOOK_TOKEN = this.configService.getOrThrow<string>('CAUR_GITLAB_WEBHOOK_TOKEN');
    this.WEBHOOK_SIGNING_TOKEN = this.configService.get<string>('CAUR_GITLAB_WEBHOOK_SIGNING_TOKEN');
  }

  @Post('update')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Update GitLab cache via webhook.' })
  @ApiHeaders([
    { name: 'X-Gitlab-Token', description: 'GitLab webhook token (legacy)', required: false },
    { name: 'webhook-id', description: 'Standard Webhooks message id', required: false },
    { name: 'webhook-timestamp', description: 'Standard Webhooks timestamp', required: false },
    { name: 'webhook-signature', description: 'Standard Webhooks HMAC signature', required: false },
  ])
  @ApiBody({ type: Object, description: 'GitLab pipeline webhook payload' })
  @ApiNoContentResponse({ description: 'Cache update triggered.' })
  async updateCache(
    @Req() req: RawBodyRequest<FastifyRequest>,
    @Headers('webhook-id') webhookId: string | undefined,
    @Headers('webhook-timestamp') webhookTimestamp: string | undefined,
    @Headers('webhook-signature') webhookSignature: string | undefined,
    @Headers('X-Gitlab-Token') legacyToken: string | undefined,
    @Body({ schema: gitlabWebhookBodySchema }) body: GitlabWebhookBodyDto,
  ): Promise<void> {
    const rawBody = req.rawBody?.toString('utf-8') ?? JSON.stringify(body);
    if (this.WEBHOOK_SIGNING_TOKEN) {
      if (!webhookId || !webhookTimestamp || !webhookSignature) {
        throw new UnauthorizedException('Missing Standard Webhooks signature headers', {
          errorCode: 'INVALID_SIGNATURE',
        });
      }
      if (!verifyStandardWebhookSignature(this.WEBHOOK_SIGNING_TOKEN, webhookId, webhookTimestamp, rawBody, webhookSignature)) {
        throw new UnauthorizedException('Invalid Standard Webhooks signature', { errorCode: 'INVALID_SIGNATURE' });
      }
    } else if (legacyToken !== this.WEBHOOK_TOKEN) {
      throw new UnauthorizedException('Invalid token', { errorCode: 'INVALID_TOKEN' });
    }

    if (body.object_kind === 'pipeline') {
      await this.gitlabPipelineService.handlePipelineWebhook(body);
    } else {
      await this.gitlabMergeRequestService.handleMergeRequestWebhook();
    }
  }

  @Post('mr-scan')
  @UseGuards(AuthGuard, RequireGroupGuard)
  @RequireGroups(GITLAB_GROUP_CHAOTIC_AUR)
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({ summary: 'Run the merge request security scan now (auto-flag labels and VirusTotal checks).' })
  @ApiCreatedResponse({ description: 'Merge request scan triggered.' })
  mrScan(): void {
    void this.gitlabMergeRequestService.handleAutoFlagRefresh();
  }

  @Post('aur-scan')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { ttl: AUR_SCAN_THROTTLE_TTL_MS, limit: AUR_SCAN_THROTTLE_LIMIT } })
  @UseGuards(AuthGuard)
  @OptionalAuth()
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({
    summary:
      'Scan an AUR package: PKGBUILD sources and static rules for everyone, VirusTotal checks for authenticated sessions.',
  })
  @ApiCreatedResponse({
    description: 'The scan result; VirusTotal reports follow via GET once completed.',
    schema: schemaResponse(aurPackageScanSchema).schema,
  })
  async startAurScan(
    @Session() session?: UserSession<typeof auth>,
    @Body({ schema: aurScanBodySchema }) body?: AurScanBodyDto,
  ): Promise<AurPackageScan> {
    if (!body) throw new BadRequestException('Missing request body');
    const withVirusTotal = session?.user !== undefined;
    const withLlm = session?.user !== undefined;
    return this.aurScanService.startScan(body.package, { withVirusTotal, withLlm });
  }

  @Get('aur-scan/:packageName')
  @ApiParam({ name: 'packageName', description: 'AUR package name' })
  @ApiOperation({ summary: 'Fetch the current AUR package scan result.' })
  @ApiOkResponse({ description: 'The current scan result.', schema: schemaResponse(aurPackageScanSchema).schema })
  async getAurScan(@Param('packageName') packageName: string): Promise<AurPackageScan> {
    const scan = this.aurScanService.getScan(packageName);
    if (!scan) throw new NotFoundException(`No scan recorded for "${packageName}"`);
    return { ...scan };
  }

  @Sse('aur-scan/:packageName/stream')
  @ApiParam({ name: 'packageName', description: 'AUR package name' })
  @SkipThrottle()
  @ApiOperation({ summary: 'Stream AUR package scan updates until the scan completes.' })
  @ApiOkResponse({ description: 'Stream of AurScanStreamChunk messages', type: Object })
  streamAurScan(@Param('packageName') packageName: string): Observable<SseMessage<AurScanStreamChunk>> {
    return this.aurScanService.streamScan(packageName);
  }

  @Get('aur-search')
  @Throttle({ default: { ttl: EXTERNAL_PROXY_THROTTLE_TTL_MS, limit: AUR_SEARCH_THROTTLE_LIMIT } })
  @ApiOperation({ summary: 'Search AUR for packages matching a query.' })
  @ApiOkResponse({
    description: 'Array of AUR package names matching the search query.',
    type: [String],
  })
  async searchAur(@Query({ schema: aurSearchQuerySchema }) query: AurSearchQueryDto): Promise<string[]> {
    const arg = query.arg;
    if (!arg || arg.length < 3) return [];
    return await this.aurScanService.searchAur(arg);
  }

  @Get('pipelines')
  @ApiOperation({ summary: 'Get recent GitLab pipelines.' })
  @ApiOkResponse({
    description: 'List of pipelines',
    schema: schemaResponseArray(pipelineWithExternalStatusSchema).schema,
  })
  async getLastPipelines(): Promise<PipelineWithExternalStatus[]> {
    return await this.gitlabPipelineService.getLastPipelines();
  }

  @Get('pipelines/:pipelineId/jobs')
  @Throttle({ default: { ttl: EXTERNAL_PROXY_THROTTLE_TTL_MS, limit: PIPELINE_JOBS_THROTTLE_LIMIT } })
  @ApiOperation({ summary: 'Get the jobs of a GitLab pipeline.' })
  @ApiOkResponse({ description: 'List of jobs', schema: schemaResponseArray(gitlabJobSchema).schema })
  async getPipelineJobs(
    @Param('pipelineId', { schema: gitlabIdParamSchema }) pipelineId: number,
  ): Promise<GitlabJob[]> {
    return await this.gitlabJobTraceService.listPipelineJobs(pipelineId);
  }

  @Sse('pipelines/:pipelineId/jobs/:jobId/trace')
  @SkipThrottle()
  @ApiOperation({ summary: 'Stream the live trace of a GitLab pipeline job over SSE.' })
  @ApiOkResponse({ description: 'Stream of GitlabLogChunk messages', type: Object })
  @ApiQuery({ name: 'offset', required: false, description: 'Resume from this character offset', type: Number })
  @ApiHeaders([
    { name: 'last-event-id', required: false, description: 'Native EventSource reconnect: last received frame id' },
  ])
  async streamJobTrace(
    @Param('pipelineId', { schema: gitlabIdParamSchema }) pipelineId: number,
    @Param('jobId', { schema: gitlabIdParamSchema }) jobId: number,
    @Query('offset', { schema: offsetQuerySchema.default(0) }) offset: number,
    // Native EventSource reconnects replay the last received frame id here.
    @Headers('last-event-id') lastEventId?: string,
  ): Promise<Observable<SseMessage<GitlabLogChunk>>> {
    const headerOffset = Number(lastEventId);
    const resumeAt = offset > 0 ? offset : Number.isInteger(headerOffset) && headerOffset > 0 ? headerOffset : 0;
    return await this.gitlabJobTraceService.getJobTraceStream(pipelineId, jobId, resumeAt);
  }

  @Get('merge-requests')
  @ApiOperation({ summary: 'Get recent open GitLab merge requests with diff data.' })
  @ApiOkResponse({
    description: 'List of open merge requests',
    schema: schemaResponseArray(mergeRequestWithDiffsSchema).schema,
  })
  async getOpenMergeRequests(): Promise<MergeRequestWithDiffs[]> {
    return await this.gitlabMergeRequestService.getOpenMergeRequests();
  }

  @Get('schedules')
  @UseGuards(AuthGuard, RequireGroupGuard)
  @RequireRepoGroup()
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({ summary: 'Get the active pipeline schedules of the given repository.' })
  @ApiQuery({ name: 'repo', description: 'Repository name', example: 'chaotic-aur' })
  @ApiOkResponse({
    description: 'List of active pipeline schedules',
    schema: schemaResponseArray(pipelineScheduleOptionSchema).schema,
  })
  async getSchedules(
    @Query({ schema: schedulesQuerySchema }) query: SchedulesQueryDto,
  ): Promise<PipelineScheduleOption[]> {
    return await this.gitlabPipelineService.listPipelineSchedules(query.repo);
  }

  @Get('review-stats')
  @ApiOperation({ summary: 'Get GitLab merge request review statistics per user.' })
  @ApiQuery({ name: 'days', required: false, type: Number, description: 'Optional time range in days' })
  @ApiOkResponse({ description: 'Merge request review statistics', schema: schemaResponse(reviewStatsSchema).schema })
  async getReviewStats(@Query({ schema: daysQuerySchema }) query: DaysQueryDto) {
    return await this.gitlabMergeRequestService.getReviewStats(query.days);
  }

  @Get('review-stats/over-time')
  @ApiOperation({ summary: 'Get GitLab merge request review statistics per user over time.' })
  @ApiQuery({ name: 'days', required: false, type: Number, description: 'Optional time range in days' })
  @ApiOkResponse({
    description: 'Merge request review statistics over time',
    schema: schemaResponse(reviewStatsOverTimeSchema).schema,
  })
  async getReviewStatsOverTime(@Query({ schema: daysQuerySchema }) query: DaysQueryDto) {
    return await this.gitlabMergeRequestService.getReviewStatsOverTime(query.days);
  }

  @Post('approve')
  @UseGuards(AuthGuard, RequireGroupGuard)
  @RequireGroups(GITLAB_GROUP_CHAOTIC_AUR)
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({ summary: 'Approve a merge request.' })
  @ApiOkResponse({ description: 'Merge request approved.', schema: schemaResponse(approveMrResponseSchema).schema })
  async approve(
    @Session() session: UserSession<typeof auth>,
    @Body({ schema: approveMrBodySchema }) body: ApproveMrDto,
  ): Promise<ApproveMrResponseShared> {
    return await this.gitlabMergeRequestService.approveMergeRequest(body.iid, body.sha, {
      userId: session.user.id,
      userName: session.user.name,
    });
  }

  @Post('flag')
  @UseGuards(AuthGuard, RequireGroupGuard)
  @RequireGroups(GITLAB_GROUP_CHAOTIC_AUR)
  @ApiCookieAuth('better-auth.session_token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Flag a merge request.' })
  @ApiNoContentResponse({ description: 'Merge request flagged.' })
  async flag(
    @Session() session: UserSession<typeof auth>,
    @Body({ schema: flagMrBodySchema }) body: FlagMrDto,
  ): Promise<void> {
    await this.gitlabMergeRequestService.flagMergeRequest(body.iid, body.label, {
      userId: session.user.id,
      userName: session.user.name,
    });
  }

  @Post('bump-packages')
  @UseGuards(AuthGuard, RequireGroupGuard)
  @RequireRepoGroup()
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({ summary: 'Bump packages via a direct Git commit.' })
  @ApiOkResponse({ description: 'Bump commit created.', schema: schemaResponse(pipelineTriggerResultSchema).schema })
  async bumpPackages(
    @Session() session: UserSession<typeof auth>,
    @Body({ schema: bumpPackagesGitlabBodySchema }) body: BumpPackagesDto,
  ): Promise<PipelineTriggerResult> {
    return await this.gitlabPackageOpsService.bumpPackages(body.packages, body.repo, body.ref ?? 'main', {
      userId: session.user.id,
      userName: session.user.name,
    });
  }

  @Post('add-packages')
  @UseGuards(AuthGuard, RequireGroupGuard)
  @RequireRepoGroup()
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({ summary: 'Add new packages via a direct Git commit.' })
  @ApiOkResponse({ description: 'Add commit created.', schema: schemaResponse(pipelineTriggerResultSchema).schema })
  async addPackages(
    @Session() session: UserSession<typeof auth>,
    @Body({ schema: addPackagesBodySchema }) body: AddPackagesDto,
  ): Promise<PipelineTriggerResult> {
    return await this.gitlabPackageOpsService.addPackages(
      body.packages,
      body.repo,
      body.request_origin,
      body.ref ?? 'main',
      {
        userId: session.user.id,
        userName: session.user.name,
      },
      body.request_reason,
      body.custom_request_reason,
    );
  }

  @Post('drop-packages')
  @UseGuards(AuthGuard, RequireGroupGuard)
  @RequireRepoGroup()
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({ summary: 'Drop packages via a direct Git commit.' })
  @ApiOkResponse({ description: 'Drop commit created.', schema: schemaResponse(pipelineTriggerResultSchema).schema })
  async dropPackages(
    @Session() session: UserSession<typeof auth>,
    @Body({ schema: dropPackagesBodySchema }) body: DropPackagesDto,
  ): Promise<PipelineTriggerResult> {
    return await this.gitlabPackageOpsService.dropPackages(body.packages, body.repo, body.ref ?? 'main', {
      userId: session.user.id,
      userName: session.user.name,
    });
  }

  @Post('run-schedule')
  @UseGuards(AuthGuard, RequireGroupGuard)
  @RequireRepoGroup()
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({ summary: 'Trigger a GitLab pipeline schedule directly via API.' })
  @ApiOkResponse({
    description: 'Pipeline schedule triggered.',
    schema: schemaResponse(pipelineTriggerResultSchema).schema,
  })
  async runSchedule(
    @Session() session: UserSession<typeof auth>,
    @Body({ schema: runScheduleBodySchema }) body: RunScheduleDto,
  ): Promise<PipelineTriggerResult> {
    return await this.gitlabPipelineService.runSchedule(body.scheduleId, body.repo, {
      userId: session.user.id,
      userName: session.user.name,
    });
  }

  @Post('trigger')
  @UseGuards(AuthGuard, RequireGroupGuard)
  @RequireGroups(GITLAB_GROUP_CHAOTIC_AUR)
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({ summary: 'Trigger a custom pipeline with the given inputs.' })
  @ApiOkResponse({ description: 'Pipeline triggered.', schema: schemaResponse(pipelineTriggerResultSchema).schema })
  async triggerPipeline(
    @Session() session: UserSession<typeof auth>,
    @Body({ schema: triggerPipelineBodySchema }) body: TriggerPipelineDto,
  ): Promise<PipelineTriggerResult> {
    const { ref, inputs } = validatePipelineTriggerInputs(body);
    return await this.gitlabPipelineService.triggerPipelineRun(inputs, ref, {
      userId: session.user.id,
      userName: session.user.name,
    });
  }
}
