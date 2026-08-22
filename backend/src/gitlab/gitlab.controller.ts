import {
  AddPackagesDto,
  ApproveMrDto,
  ApproveMrResponseDto,
  AurScanBodyDto,
  BumpPackagesDto,
  DropPackagesDto,
  FlagMrDto,
  RunScheduleDto,
  TriggerPipelineDto,
} from '@chaotic-next/backend/gitlab/gitlab.dto';
import {
  AurPackageScan,
  AurScanStreamChunk,
  GitlabJob,
  GitlabLogChunk,
  MergeRequestWithDiffs,
  PipelineScheduleOption,
  PipelineTriggerResult,
  PipelineWithExternalStatus,
} from '@chaotic-next/shared-lib';
import { SkipThrottle } from '@nestjs/throttler';
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
  ParseIntPipe,
  Post,
  Query,
  Sse,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeaders,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard, Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { Observable } from 'rxjs';
import { auth } from '../auth/auth';
import { GITLAB_GROUP_CHAOTIC_AUR } from '../auth/gitlab-groups';
import { type SseMessage } from '../utils/sse';
import { RequireGroupGuard } from '../guards/require-group.guard';
import { requireGroups, requireRepoGroup } from '../decorators/require-groups.decorator';
import { AurScanService } from '../diff-scan/aur-scan.service';
import { GitlabService } from './gitlab.service';
import {
  AurPackageScanDto,
  GitlabJobDto,
  MergeRequestWithDiffsDto,
  PipelineScheduleOptionDto,
  PipelineTriggerResultDto,
  PipelineWithExternalStatusDto,
  ReviewStatsDto,
  ReviewStatsOverTimeDto,
} from './gitlab-response.dto';
import type { GitLabWebHook } from './interfaces';
import { validatePipelineTriggerInputs } from './pipeline-trigger-inputs';

const SHA_REGEX = /^[0-9a-fA-F]{6,40}$/;
const FLAG_LABELS = ['dangerous', 'hold'] as const;

function assertValidIid(iid: number): void {
  if (!Number.isInteger(iid) || iid <= 0) {
    throw new BadRequestException('Invalid iid');
  }
}

@ApiTags('gitlab')
@Controller('gitlab')
export class GitlabController {
  WEBHOOK_TOKEN: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly gitlabService: GitlabService,
    private readonly aurScanService: AurScanService,
  ) {
    this.WEBHOOK_TOKEN = this.configService.getOrThrow<string>('CAUR_GITLAB_WEBHOOK_TOKEN');
  }

  @Post('update')
  @ApiOperation({ summary: 'Update GitLab cache via webhook.' })
  @ApiHeaders([{ name: 'X-Gitlab-Token', description: 'GitLab webhook token', required: true }])
  @ApiBody({ type: Object, description: 'GitLab pipeline webhook payload' })
  @ApiOkResponse({ description: 'Cache update triggered.' })
  async updateCache(@Headers('X-Gitlab-Token') token: string, @Body() body: GitLabWebHook): Promise<void> {
    if (token !== this.WEBHOOK_TOKEN) {
      throw new UnauthorizedException('Invalid token');
    }

    if (body.object_kind !== 'pipeline' && body.object_kind !== 'merge_request') {
      throw new BadRequestException('Invalid object_kind');
    }

    if (body.object_kind === 'pipeline') {
      await this.gitlabService.handlePipelineWebhook(body);
    } else {
      await this.gitlabService.handleMergeRequestWebhook();
    }
  }

  @Post('mr-scan')
  @UseGuards(AuthGuard, RequireGroupGuard)
  @requireGroups(GITLAB_GROUP_CHAOTIC_AUR)
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({ summary: 'Run the merge request security scan now (auto-flag labels and VirusTotal checks).' })
  @ApiOkResponse({ description: 'Merge request scan triggered.' })
  mrScan(): void {
    void this.gitlabService.handleAutoFlagRefresh();
  }

  @Post('aur-scan')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard)
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({ summary: 'Scan an AUR package: PKGBUILD sources, static rules and VirusTotal checks.' })
  @ApiCreatedResponse({
    description: 'The scan result; VirusTotal reports follow via GET once completed.',
    type: AurPackageScanDto,
  })
  startAurScan(@Body() body: AurScanBodyDto): Promise<AurPackageScan> {
    return this.aurScanService.startScan(body.package);
  }

  @Get('aur-scan/:packageName')
  @UseGuards(AuthGuard)
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({ summary: 'Fetch the current AUR package scan result.' })
  @ApiOkResponse({ description: 'The current scan result.', type: AurPackageScanDto })
  async getAurScan(@Param('packageName') packageName: string): Promise<AurPackageScan> {
    const scan = this.aurScanService.getScan(packageName);
    if (!scan) throw new NotFoundException(`No scan recorded for "${packageName}"`);
    return { ...scan };
  }

  @Sse('aur-scan/:packageName/stream')
  @SkipThrottle()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Stream AUR package scan updates until the scan completes.' })
  @ApiOkResponse({ description: 'Stream of AurScanStreamChunk messages', type: Object })
  streamAurScan(@Param('packageName') packageName: string): Observable<SseMessage<AurScanStreamChunk>> {
    return this.aurScanService.streamScan(packageName);
  }

  @Get('pipelines')
  @ApiOperation({ summary: 'Get recent GitLab pipelines.' })
  @ApiOkResponse({ description: 'List of pipelines', type: PipelineWithExternalStatusDto, isArray: true })
  async getLastPipelines(): Promise<PipelineWithExternalStatus[]> {
    return await this.gitlabService.getLastPipelines();
  }

  @Get('pipelines/:pipelineId/jobs')
  @ApiOperation({ summary: 'Get the jobs of a GitLab pipeline.' })
  @ApiOkResponse({ description: 'List of jobs', type: GitlabJobDto, isArray: true })
  async getPipelineJobs(@Param('pipelineId', ParseIntPipe) pipelineId: number): Promise<GitlabJob[]> {
    return await this.gitlabService.listPipelineJobs(pipelineId);
  }

  @Sse('pipelines/:pipelineId/jobs/:jobId/trace')
  @SkipThrottle()
  @ApiOperation({ summary: 'Stream the live trace of a GitLab pipeline job over SSE.' })
  @ApiOkResponse({ description: 'Stream of GitlabLogChunk messages', type: Object })
  @ApiQuery({ name: 'offset', required: false, description: 'Resume from this offset', type: Number })
  async streamJobTrace(
    @Param('pipelineId', ParseIntPipe) pipelineId: number,
    @Param('jobId', ParseIntPipe) jobId: number,
    @Query('offset', new ParseIntPipe({ optional: true })) offset = 0,
    // Native EventSource reconnects replay the last received frame id here.
    @Headers('last-event-id') lastEventId?: string,
  ): Promise<Observable<SseMessage<GitlabLogChunk>>> {
    const headerOffset = Number(lastEventId);
    const resumeAt = offset > 0 ? offset : Number.isInteger(headerOffset) && headerOffset > 0 ? headerOffset : 0;
    return await this.gitlabService.getJobTraceStream(pipelineId, jobId, resumeAt);
  }

  @Get('merge-requests')
  @ApiOperation({ summary: 'Get recent open GitLab merge requests with diff data.' })
  @ApiOkResponse({ description: 'List of open merge requests', type: MergeRequestWithDiffsDto, isArray: true })
  async getOpenMergeRequests(): Promise<MergeRequestWithDiffs[]> {
    return await this.gitlabService.getOpenMergeRequests();
  }

  @Get('schedules')
  @UseGuards(AuthGuard)
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({ summary: 'Get the active pipeline schedules of the chaotic-aur project.' })
  @ApiOkResponse({ description: 'List of active pipeline schedules', type: PipelineScheduleOptionDto, isArray: true })
  async getSchedules(): Promise<PipelineScheduleOption[]> {
    return await this.gitlabService.listPipelineSchedules();
  }

  @Get('review-stats')
  @ApiOperation({ summary: 'Get GitLab merge request review statistics per user.' })
  @ApiQuery({ name: 'days', required: false, type: Number, description: 'Optional time range in days' })
  @ApiOkResponse({ description: 'Merge request review statistics', type: ReviewStatsDto })
  async getReviewStats(@Query('days') days?: string) {
    return await this.gitlabService.getReviewStats(parseOptionalDays(days));
  }

  @Get('review-stats/over-time')
  @ApiOperation({ summary: 'Get GitLab merge request review statistics per user over time.' })
  @ApiQuery({ name: 'days', required: false, type: Number, description: 'Optional time range in days' })
  @ApiOkResponse({ description: 'Merge request review statistics over time', type: ReviewStatsOverTimeDto })
  async getReviewStatsOverTime(@Query('days') days?: string) {
    return await this.gitlabService.getReviewStatsOverTime(parseOptionalDays(days));
  }

  @Post('approve')
  @UseGuards(AuthGuard, RequireGroupGuard)
  @requireGroups(GITLAB_GROUP_CHAOTIC_AUR)
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({ summary: 'Approve a merge request.' })
  @ApiOkResponse({ description: 'Merge request approved.', type: ApproveMrResponseDto })
  async approve(
    @Session() session: UserSession<typeof auth>,
    @Body() body: ApproveMrDto,
  ): Promise<ApproveMrResponseDto> {
    assertValidIid(body.iid);
    if (typeof body.sha !== 'string' || !SHA_REGEX.test(body.sha)) {
      throw new BadRequestException('Invalid sha');
    }
    return await this.gitlabService.approveMergeRequest(body.iid, body.sha, {
      userId: session.user.id,
      userName: session.user.name,
    });
  }

  @Post('flag')
  @UseGuards(AuthGuard, RequireGroupGuard)
  @requireGroups(GITLAB_GROUP_CHAOTIC_AUR)
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({ summary: 'Flag a merge request.' })
  @ApiOkResponse({ description: 'Merge request flagged.' })
  async flag(@Session() session: UserSession<typeof auth>, @Body() body: FlagMrDto): Promise<void> {
    assertValidIid(body.iid);
    if (!FLAG_LABELS.includes(body.label)) {
      throw new BadRequestException(`Invalid label, must be one of: ${FLAG_LABELS.join(', ')}`);
    }
    await this.gitlabService.flagMergeRequest(body.iid, body.label, {
      userId: session.user.id,
      userName: session.user.name,
    });
  }

  @Post('bump-packages')
  @UseGuards(AuthGuard, RequireGroupGuard)
  @requireRepoGroup()
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({ summary: 'Bump packages via a direct Git commit.' })
  @ApiOkResponse({ description: 'Bump commit created.', type: PipelineTriggerResultDto })
  async bumpPackages(
    @Session() session: UserSession<typeof auth>,
    @Body() body: BumpPackagesDto,
  ): Promise<PipelineTriggerResult> {
    return await this.gitlabService.bumpPackages(body.packages, body.repo, body.ref ?? 'main', {
      userId: session.user.id,
      userName: session.user.name,
    });
  }

  @Post('add-packages')
  @UseGuards(AuthGuard, RequireGroupGuard)
  @requireRepoGroup()
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({ summary: 'Add new packages via a direct Git commit.' })
  @ApiOkResponse({ description: 'Add commit created.', type: PipelineTriggerResultDto })
  async addPackages(
    @Session() session: UserSession<typeof auth>,
    @Body() body: AddPackagesDto,
  ): Promise<PipelineTriggerResult> {
    return await this.gitlabService.addPackages(
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
  @requireRepoGroup()
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({ summary: 'Drop packages via a direct Git commit.' })
  @ApiOkResponse({ description: 'Drop commit created.', type: PipelineTriggerResultDto })
  async dropPackages(
    @Session() session: UserSession<typeof auth>,
    @Body() body: DropPackagesDto,
  ): Promise<PipelineTriggerResult> {
    return await this.gitlabService.dropPackages(body.packages, body.repo, body.ref ?? 'main', {
      userId: session.user.id,
      userName: session.user.name,
    });
  }

  @Post('run-schedule')
  @UseGuards(AuthGuard, RequireGroupGuard)
  @requireGroups(GITLAB_GROUP_CHAOTIC_AUR)
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({ summary: 'Trigger a GitLab pipeline schedule directly via API.' })
  @ApiOkResponse({ description: 'Pipeline schedule triggered.', type: PipelineTriggerResultDto })
  async runSchedule(
    @Session() session: UserSession<typeof auth>,
    @Body() body: RunScheduleDto,
  ): Promise<PipelineTriggerResult> {
    return await this.gitlabService.runSchedule(body.scheduleId, {
      userId: session.user.id,
      userName: session.user.name,
    });
  }

  @Post('trigger')
  @UseGuards(AuthGuard, RequireGroupGuard)
  @requireGroups(GITLAB_GROUP_CHAOTIC_AUR)
  @ApiCookieAuth('better-auth.session_token')
  @ApiOperation({ summary: 'Trigger a custom pipeline with the given inputs.' })
  @ApiOkResponse({ description: 'Pipeline triggered.', type: PipelineTriggerResultDto })
  async triggerPipeline(
    @Session() session: UserSession<typeof auth>,
    @Body() body: TriggerPipelineDto,
  ): Promise<PipelineTriggerResult> {
    const { ref, inputs } = validatePipelineTriggerInputs(body);
    return await this.gitlabService.triggerPipelineRun(inputs, ref, {
      userId: session.user.id,
      userName: session.user.name,
    });
  }
}

/** Parses the optional `days` query param, returning undefined for missing or non-numeric values. */
function parseOptionalDays(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}
