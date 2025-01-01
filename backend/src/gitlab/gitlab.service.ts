import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommitStatusSchema, Gitlab, PipelineSchema } from '@gitbeaker/rest';
import { PipelineWebhook } from './interfaces';
import { PipelineWithExternalStatus } from '@./shared-lib';

@Injectable()
export class GitlabService {
  api = new Gitlab({
    token: this.configService.getOrThrow<string>('CAUR_GITLAB_TOKEN'),
  });

  private readonly chaoticId = this.configService.getOrThrow<string>('CAUR_GITLAB_ID_CAUR');
  private readonly garudaId = this.configService.getOrThrow<string>('CAUR_GITLAB_ID_GARUDA');
  private readonly botEmail = this.configService.getOrThrow<string>('CAUR_AUTO_COMMIT_AUTHOR');

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  private isExternalStage(name: string): boolean {
    return name.startsWith('chaotic-aur:') || name.startsWith('garuda:');
  }

  updatePipelineCache(body: PipelineWebhook) {
    Logger.log('Pipeline webhook received', 'GitlabService');
    Logger.log(body, 'GitlabService');

    const pages = [1, 2, 3, 4];
    pages.map((page) => {
      this.httpService.get(`/gitlab/pipelines/${page}`).subscribe({
        next: (response) => {
          Logger.log(response.data, 'GitlabService');
        },
        error: (err) => {
          Logger.error(err, 'GitlabService');
        },
      });
    });
  }

  async getLastPipelines(options: { page?: number }): Promise<PipelineWithExternalStatus[]> {
    try {
      const fetchPromises: Promise<{ commit: CommitStatusSchema[]; pipeline: PipelineSchema }>[] = [];

      let allPipelines: PipelineSchema[] = await this.api.Pipelines.all(this.chaoticId, {
        maxPages: 1,
        page: options.page,
        perPage: 50,
      });
      allPipelines = allPipelines.filter((pipeline) => pipeline.status !== 'skipped');

      for (const pipeline of allPipelines) {
        this.getCommitStatus(pipeline, fetchPromises);
      }

      const promiseResults = await Promise.all(fetchPromises);
      return promiseResults.sort((a, b) => b.pipeline.id - a.pipeline.id);
    } catch (err) {
      Logger.error(err, 'GitlabService');
    }
  }

  private getCommitStatus(
    pipeline: PipelineSchema,
    promiseArray: Promise<{
      commit: CommitStatusSchema[];
      pipeline: PipelineSchema;
    }>[],
  ) {
    promiseArray.push(
      new Promise((resolve) => {
        this.api.Commits.allStatuses(this.chaoticId, pipeline.sha).then((statuses) => {
          const onlyExternal: CommitStatusSchema[] = statuses.filter((status) => this.isExternalStage(status.name));
          resolve({
            commit: onlyExternal.filter((status) => status.pipeline_id === pipeline.id),
            pipeline,
          });
        });
      }),
    );
  }
}
