import { CACHE_GITLAB_TTL, PipelineWithExternalStatus } from '@./shared-lib';
import { CommitStatusSchema, Gitlab, PipelineSchema } from '@gitbeaker/rest';
import { type Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Mutex } from 'async-mutex';
import { EventService } from '../events/event.service';
import { PipelineWebhook } from './interfaces';

@Injectable()
export class GitlabService {
  api: any;
  updateMutex = new Mutex();

  private readonly CACHE_KEY_PIPELINES = 'gitlab/pipelines';
  private readonly chaoticId: string;

  // private readonly garudaId: string;

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly configService: ConfigService,
    private readonly eventService: EventService,
  ) {
    this.chaoticId = this.configService.getOrThrow<string>('CAUR_GITLAB_ID_CAUR');
    this.api = new Gitlab({
      token: this.configService.getOrThrow<string>('CAUR_GITLAB_TOKEN'),
    });
  }

  /**
   * Get the last GitLab pipelines for the chaotic-aur. Caches the result for CACHE_GITLAB_TTL (10s).
   * @returns The last pipelines with their external statuses (aka build logs)
   */
  async getLastPipelines(): Promise<PipelineWithExternalStatus[]> {
    let data: PipelineWithExternalStatus[] = await this.cacheManager.get<PipelineWithExternalStatus[]>(
      this.CACHE_KEY_PIPELINES,
    );
    if (!data) {
      data = await this.updateMutex.runExclusive(async () => {
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

          const promiseResults: PipelineWithExternalStatus[] = await Promise.all(fetchPromises);
          return promiseResults.sort((a, b) => b.pipeline.id - a.pipeline.id);
        } catch (err) {
          Logger.error(err, 'GitlabService');
        }
      });

      await this.cacheManager.set(this.CACHE_KEY_PIPELINES, data, CACHE_GITLAB_TTL);
    }
    return data;
  }

  /**
   * Bust the cache for the pipelines.
   * @param body Body of GitLab API call
   * @returns True if the cache was successfully busted, false otherwise
   */
  public async bustCache(body: PipelineWebhook): Promise<boolean> {
    const cacheDeleted = await this.cacheManager.del(this.CACHE_KEY_PIPELINES);
    this.eventService.sseEvents$.next({ data: { type: 'pipeline' } });
    return cacheDeleted;
  }

  /**
   * Get the commit status for a pipeline, pushing the promise to the array of promises
   * @param pipeline The pipeline to get the status for
   * @param promiseArray The array of promises to push the new promise to
   */
  private getCommitStatus(pipeline: PipelineSchema, promiseArray: Promise<PipelineWithExternalStatus>[]) {
    promiseArray.push(
      new Promise((resolve) => {
        this.api.Commits.allStatuses(this.chaoticId, pipeline.sha).then((statuses: CommitStatusSchema[]) => {
          const onlyExternal: CommitStatusSchema[] = statuses.filter((status: CommitStatusSchema) =>
            this.isExternalStage(status.name),
          );
          resolve({
            commit: onlyExternal.filter((status) => status.pipeline_id === pipeline.id),
            pipeline,
          });
        });
      }),
    );
  }

  /**
   * Check if a stage is an external stage appended by our Chaotic Manager.
   * @param name The name of the stage
   */
  private isExternalStage(name: string): boolean {
    return name.startsWith('chaotic-aur:') || name.startsWith('garuda:');
  }
}
