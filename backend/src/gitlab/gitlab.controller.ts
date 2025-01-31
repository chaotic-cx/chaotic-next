import { PipelineWithExternalStatus } from '@./shared-lib';
import { Body, Controller, Get, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PipelineWebhook } from 'backend/src/gitlab/interfaces';
import { AllowAnonymous } from '../auth/anonymous.decorator';
import { GitlabService } from './gitlab.service';

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
  updateCache(@Headers('X-Gitlab-Token') token: string, @Body() body: PipelineWebhook): void {
    if (token !== this.WEBHOOK_TOKEN) {
      throw new UnauthorizedException('Invalid token');
    }
    return void this.gitlabService.bustCache();
  }

  @AllowAnonymous()
  @Get('pipelines')
  async getPipelines(): Promise<PipelineWithExternalStatus[]> {
    return await this.gitlabService.getLastPipelines();
  }
}
