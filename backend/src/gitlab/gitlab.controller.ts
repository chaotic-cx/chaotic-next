import { PipelineWithExternalStatus } from '@./shared-lib';
import { Body, Controller, Get, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PipelineWebhook } from 'backend/src/gitlab/interfaces';
import { AllowAnonymous } from '../auth/anonymous.decorator';
import { GitlabService } from './gitlab.service';
import { ApiTags, ApiOperation, ApiOkResponse, ApiParam, ApiBody } from '@nestjs/swagger';

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

  @AllowAnonymous()
  @Post('update')
  @ApiOperation({ summary: 'Update GitLab cache via webhook.' })
  @ApiBody({ type: Object, description: 'GitLab pipeline webhook payload' })
  @ApiOkResponse({ description: 'Cache update triggered.' })
  updateCache(@Headers('X-Gitlab-Token') token: string, @Body() body: PipelineWebhook): void {
    if (token !== this.WEBHOOK_TOKEN) {
      throw new UnauthorizedException('Invalid token');
    }
    return void this.gitlabService.bustCache();
  }

  @AllowAnonymous()
  @Get('pipelines')
  @ApiOperation({ summary: 'Get recent GitLab pipelines.' })
  @ApiOkResponse({ description: 'List of pipelines', isArray: true })
  async getPipelines(): Promise<PipelineWithExternalStatus[]> {
    return await this.gitlabService.getLastPipelines();
  }
}
