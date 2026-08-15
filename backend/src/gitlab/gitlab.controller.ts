import {
  MergeRequestWithDiffs,
  PipelineScheduleOption,
  PipelineTriggerResult,
  PipelineWithExternalStatus,
} from '@chaotic-next/shared-lib';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard, Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { GitlabService } from './gitlab.service';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { GitLabWebHook } from './interfaces';
import { validatePipelineTriggerInputs } from './pipeline-trigger-inputs';
import { auth } from '../auth/auth';

const SHA_REGEX = /^[0-9a-fA-F]{6,40}$/;
const FLAG_LABELS = ['dangerous', 'hold'] as const;
type FlagLabel = (typeof FLAG_LABELS)[number];

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
  ) {
    this.WEBHOOK_TOKEN = this.configService.getOrThrow<string>('CAUR_GITLAB_WEBHOOK_TOKEN');
  }

  @Post('update')
  @ApiOperation({ summary: 'Update GitLab cache via webhook.' })
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

  @Get('pipelines')
  @ApiOperation({ summary: 'Get recent GitLab pipelines.' })
  @ApiOkResponse({ description: 'List of pipelines', isArray: true })
  async getLastPipelines(): Promise<PipelineWithExternalStatus[]> {
    return await this.gitlabService.getLastPipelines();
  }

  @Get('merge-requests')
  @ApiOperation({ summary: 'Get recent open GitLab merge requests with diff data.' })
  @ApiOkResponse({ description: 'List of open merge requests', isArray: true })
  async getOpenMergeRequests(): Promise<MergeRequestWithDiffs[]> {
    return await this.gitlabService.getOpenMergeRequests();
  }

  @Get('schedules')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get the active pipeline schedules of the chaotic-aur project.' })
  @ApiOkResponse({ description: 'List of active pipeline schedules', isArray: true })
  async getSchedules(): Promise<PipelineScheduleOption[]> {
    return await this.gitlabService.listPipelineSchedules();
  }

  @Get('review-stats')
  @ApiOperation({ summary: 'Get GitLab merge request review statistics per user.' })
  @ApiOkResponse({ description: 'Merge request review statistics' })
  async getReviewStats() {
    return await this.gitlabService.getReviewStats();
  }

  @Post('approve')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Approve a merge request.' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        iid: { type: 'number' },
        sha: { type: 'string' },
      },
    },
  })
  @ApiOkResponse({ description: 'Merge request approved.' })
  async approve(
    @Session() session: UserSession<typeof auth>,
    @Body() body: { iid: number; sha: string },
  ): Promise<void> {
    assertValidIid(body.iid);
    if (typeof body.sha !== 'string' || !SHA_REGEX.test(body.sha)) {
      throw new BadRequestException('Invalid sha');
    }
    await this.gitlabService.approveMergeRequest(body.iid, body.sha, {
      userId: session.user.id,
      userName: session.user.name,
    });
  }

  @Post('flag')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Flag a merge request.' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        iid: { type: 'number' },
        label: { type: 'string' },
      },
    },
  })
  @ApiOkResponse({ description: 'Merge request flagged.' })
  async flag(
    @Session() session: UserSession<typeof auth>,
    @Body() body: { iid: number; label: FlagLabel },
  ): Promise<void> {
    assertValidIid(body.iid);
    if (!FLAG_LABELS.includes(body.label)) {
      throw new BadRequestException(`Invalid label, must be one of: ${FLAG_LABELS.join(', ')}`);
    }
    await this.gitlabService.flagMergeRequest(body.iid, body.label, {
      userId: session.user.id,
      userName: session.user.name,
    });
  }

  @Post('trigger')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Trigger a pipeline with the given inputs.' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['operation'],
      properties: {
        operation: { type: 'string', example: 'Bump Packages' },
        ref: { type: 'string', example: 'main' },
        packages: { type: 'string', example: 'nodejs:20' },
        trigger: { type: 'string' },
        add_packages: { type: 'string', example: 'paru/aur' },
        request_origin: { type: 'string', example: 'github/5678' },
        request_reason: { type: 'string', example: 'request' },
        custom_request_reason: { type: 'string' },
      },
    },
  })
  @ApiOkResponse({ description: 'Pipeline triggered.' })
  async triggerPipeline(
    @Session() session: UserSession<typeof auth>,
    @Body() body: unknown,
  ): Promise<PipelineTriggerResult> {
    const { ref, inputs } = validatePipelineTriggerInputs(body);
    return await this.gitlabService.triggerPipeline(inputs, ref, {
      userId: session.user.id,
      userName: session.user.name,
    });
  }
}
