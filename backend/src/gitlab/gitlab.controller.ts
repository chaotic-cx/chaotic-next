import { Controller, Get, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { GitlabService } from './gitlab.service';
import { AllowAnonymous } from '../auth/anonymous.decorator';
import { InMemoryCache } from '../cache.source';
import { MINUTE } from 'nestjs-omacache';
import { ConfigService } from '@nestjs/config';
import { PipelineWithExternalStatus } from '@./shared-lib';

@Controller('gitlab')
export class GitlabController {
  WEBHOOK_TOKEN = this.configService.getOrThrow<string>('CAUR_GITLAB_WEBHOOK_TOKEN');

  constructor(
    private readonly configService: ConfigService,
    private readonly gitlabService: GitlabService,
  ) {}

  @InMemoryCache({
    key: 'pipelines',
    kind: 'bust',
  })
  @AllowAnonymous()
  @Post('update')
  updateCache(@Headers('X-Gitlab-Token') token: string) {
    if (token !== this.WEBHOOK_TOKEN) {
      throw new UnauthorizedException('Invalid token');
    }
  }

  @InMemoryCache({
    key: 'pipelines',
    kind: 'temporal',
    ttl: 15 * MINUTE,
  })
  @AllowAnonymous()
  @Get('pipelines')
  async getPipelines(): Promise<PipelineWithExternalStatus[]> {
    return await this.gitlabService.getLastPipelines();
  }
}
