import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommitStatusSchema, Gitlab, PipelineSchema } from '@gitbeaker/rest';
import { PipelineWithExternalStatus } from '@./shared-lib';
import { Mutex } from 'async-mutex';

@Injectable()
export class GitlabService {
  api = new Gitlab({
    token: this.configService.getOrThrow<string>('CAUR_GITLAB_TOKEN'),
  });

  updateMutex = new Mutex();

  private readonly chaoticId = this.configService.getOrThrow<string>('CAUR_GITLAB_ID_CAUR');
  private readonly garudaId = this.configService.getOrThrow<string>('CAUR_GITLAB_ID_GARUDA');

  constructor(private readonly configService: ConfigService) {}

  private isExternalStage(name: string): boolean {
    return name.startsWith('chaotic-aur:') || name.startsWith('garuda:');
  }

  /**
   * Get the last GitLab pipelines for the chaotic-aur.
   * @returns The last pipelines with their external statuses (aka build logs)
   */
  async getLastPipelines(): Promise<PipelineWithExternalStatus[]> {
    return await this.updateMutex.runExclusive(async () => {
      try {
        const fetchPromises: Promise<{ commit: CommitStatusSchema[]; pipeline: PipelineSchema }>[] = [];

        let allPipelines: PipelineSchema[] = await this.api.Pipelines.all(this.chaoticId, {
          maxPages: 1,
          page: 1,
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
    });
  }

  /**
   * Get the commit status for a pipeline, pushing the promise to the array of promises
   * @param pipeline The pipeline to get the status for
   * @param promiseArray The array of promises to push the new promise to
   */
  private getCommitStatus(pipeline: PipelineSchema, promiseArray: Promise<PipelineWithExternalStatus>[]) {
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
