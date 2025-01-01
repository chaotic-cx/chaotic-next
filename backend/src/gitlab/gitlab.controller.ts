import { Body, Controller, Get, Headers, Param, ParseIntPipe, Post, UnauthorizedException } from '@nestjs/common';
import { GitlabService } from './gitlab.service';
import { AllowAnonymous } from '../auth/anonymous.decorator';
import { InMemoryCache } from '../cache.source';
import { MINUTE } from 'nestjs-omacache';
import { PipelineWebhook } from './interfaces';
import { ConfigService } from '@nestjs/config';
import { PipelineWithExternalStatus } from '@./shared-lib';

@Controller('gitlab')
export class GitlabController {
  WEBHOOK_TOKEN = this.configService.getOrThrow<string>('CAUR_GITLAB_WEBHOOK_TOKEN');

  constructor(
    private readonly configService: ConfigService,
    private readonly gitlabService: GitlabService,
  ) {}

  @AllowAnonymous()
  @Post('update')
  updateCache(@Body() body: PipelineWebhook, @Headers('X-Gitlab-Token') token: string) {
    if (token !== this.WEBHOOK_TOKEN) {
      throw new UnauthorizedException('Invalid token');
    }
    this.gitlabService.updatePipelineCache(body);
  }

  @InMemoryCache({
    key: 'some',
    kind: 'temporal',
    ttl: MINUTE,
    paramIndex: [0],
  })
  @AllowAnonymous()
  @Get('pipelines/:page')
  async getPipelines(@Param('page', ParseIntPipe) page?: number): Promise<PipelineWithExternalStatus[]> {
    return await this.gitlabService.getLastPipelines({ page });
  }
}
