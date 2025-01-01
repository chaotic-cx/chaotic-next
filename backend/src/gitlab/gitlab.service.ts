import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommitStatusSchema, Gitlab, PipelineSchema } from '@gitbeaker/rest';
import { PipelineWebhook } from './interfaces';

@Injectable()
export class GitlabService {
  PIPELINE_URL = 'https://gitlab.com/api/v4/projects/:id/pipelines';
  STATUS_URL = 'https://gitlab.com/api/v4/projects/:id/repository/commits/:commit/statuses';

  api = new Gitlab({
    token: this.configService.getOrThrow<string>('CAUR_GITLAB_TOKEN'),
  });

  private readonly chaoticId = this.configService.getOrThrow<string>('CAUR_GITLAB_ID_CAUR');
  private readonly garudaId = this.configService.getOrThrow<string>('CAUR_GITLAB_ID_GARUDA');
  private readonly botEmail = this.configService.getOrThrow<string>('CAUR_AUTO_COMMIT_AUTHOR');
  private readonly gitlabWebhookToken = this.configService.getOrThrow<string>('CAUR_GITLAB_WEBHOOK_TOKEN');

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

  async getLastPipelines(options: { page?: number }) {
    const fetchPromises: Promise<{ commit: CommitStatusSchema[]; pipeline: PipelineSchema }>[] = [];
    const returnValue = {
      succeeded: [],
      failed: [],
      cancelled: [],
    };

    try {
      const succeededPipelines: Promise<PipelineSchema[]> = this.api.Pipelines.all(this.chaoticId, {
        maxPages: 1,
        page: options.page,
        status: 'success',
      });
      const failedPipelines: Promise<PipelineSchema[]> = this.api.Pipelines.all(this.chaoticId, {
        maxPages: 1,
        page: options.page,
        status: 'failed',
      });
      const cancelledPipelines: Promise<PipelineSchema[]> = this.api.Pipelines.all(this.chaoticId, {
        maxPages: 1,
        page: options.page,
        status: 'canceled',
      });

      const [succeeded, failed, cancelled] = await Promise.all([
        succeededPipelines,
        failedPipelines,
        cancelledPipelines,
      ]);

      for (const pipeline of succeeded) {
        this.getCommitStatus(pipeline, fetchPromises);
      }
      for (const pipeline of failed) {
        this.getCommitStatus(pipeline, fetchPromises);
      }
      for (const pipeline of cancelled) {
        this.getCommitStatus(pipeline, fetchPromises);
      }

      const promiseResults = await Promise.all(fetchPromises);

      for (const { commit, pipeline } of promiseResults) {
        switch (pipeline.status) {
          case 'success':
            returnValue.succeeded.push({ pipeline, commit });
            break;
          case 'failed':
            returnValue.failed.push({ pipeline, commit });
            break;
          case 'canceled':
            returnValue.cancelled.push({ pipeline, commit });
            break;
        }
      }
      Logger.debug(returnValue, 'GitlabService');
      returnValue.succeeded.sort((a, b) => b.pipeline.id - a.pipeline.id);
      returnValue.failed.sort((a, b) => b.pipeline.id - a.pipeline.id);
      returnValue.cancelled.sort((a, b) => b.pipeline.id - a.pipeline.id);
    } catch (err) {
      Logger.error(err, 'GitlabService');
    }

    return returnValue;
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
          resolve({
            commit: statuses.filter((status) => this.isExternalStage(status.name)),
            pipeline,
          });
        });
      }),
    );
  }
}
