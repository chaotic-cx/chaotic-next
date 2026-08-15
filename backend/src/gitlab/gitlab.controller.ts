import { MergeRequestWithDiffs, PipelineWithExternalStatus } from '@chaotic-next/shared-lib';
import { BadRequestException, Body, Controller, Get, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GitlabService } from './gitlab.service';
import { ApiBody, ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { GitLabWebHook } from './interfaces';

const SHA_REGEX = /^[0-9a-fA-F]{6,40}$/;
const FLAG_LABELS = ['dangerous', 'hold'];

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

  @Get('review-stats')
  @ApiOperation({ summary: 'Get GitLab merge request review statistics per user.' })
  @ApiOkResponse({ description: 'Merge request review statistics' })
  async getReviewStats() {
    return await this.gitlabService.getReviewStats();
  }

  @Post('approve')
  @ApiOperation({ summary: 'Approve a merge request.' })
  @ApiHeader({ name: 'X-Gitlab-Private-Token', description: 'GitLab private token with write permissions.' })
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
    @Headers('X-Gitlab-Private-Token') token: string,
    @Body() body: { iid: number; sha: string },
  ): Promise<void> {
    if (!token) {
      throw new UnauthorizedException('GitLab private token is required');
    }
    assertValidIid(body.iid);
    if (typeof body.sha !== 'string' || !SHA_REGEX.test(body.sha)) {
      throw new BadRequestException('Invalid sha');
    }
    await this.gitlabService.approveMergeRequest(body.iid, body.sha, token);
  }

  @Post('flag')
  @ApiOperation({ summary: 'Flag a merge request.' })
  @ApiHeader({ name: 'X-Gitlab-Private-Token', description: 'GitLab private token with write permissions.' })
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
    @Headers('X-Gitlab-Private-Token') token: string,
    @Body() body: { iid: number; label: string },
  ): Promise<void> {
    if (!token) {
      throw new UnauthorizedException('GitLab private token is required');
    }
    assertValidIid(body.iid);
    if (!FLAG_LABELS.includes(body.label)) {
      throw new BadRequestException(`Invalid label, must be one of: ${FLAG_LABELS.join(', ')}`);
    }
    await this.gitlabService.flagMergeRequest(body.iid, body.label, token);
  }

  @Post('test-token')
  @ApiOperation({ summary: 'Test a GitLab private token for write permissions.' })
  @ApiHeader({ name: 'X-Gitlab-Private-Token', description: 'GitLab private token with write permissions.' })
  @ApiOkResponse({ description: 'Token validation result', type: Boolean })
  async testToken(@Headers('X-Gitlab-Private-Token') token: string): Promise<boolean> {
    if (!token) {
      throw new UnauthorizedException('GitLab private token is required');
    }
    return await this.gitlabService.testToken(token);
  }
}
