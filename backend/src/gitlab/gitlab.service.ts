import { MergeRequestWithDiffs, PipelineWithExternalStatus, PushNotification } from '@./shared-lib';
import { CommitStatusSchema, Gitlab, PipelineSchema } from '@gitbeaker/rest';
import { type Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventService } from '../events/event.service';
import { MergeRequestWebhook, PipelineWebhook } from './interfaces';
import { MergeRequestSchema } from '@gitbeaker/core';
import { readFile } from 'node:fs/promises';
import { AES, enc } from 'crypto-js';
import { PushSubscription, sendNotification } from 'web-push';

@Injectable()
export class GitlabService {
  api: any;

  private readonly CACHE_KEY_MRS = 'gitlab/merge_requests';
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
   * @param overwriteCache Whether to overwrite the cache or not
   * @returns The last pipelines with their external statuses (aka build logs)
   */
  async getLastPipelines(overwriteCache = false): Promise<PipelineWithExternalStatus[]> {
    const data: PipelineWithExternalStatus[] | undefined = await this.cacheManager.get<PipelineWithExternalStatus[]>(
      this.CACHE_KEY_PIPELINES,
    );
    if (!data || overwriteCache) {
      try {
        let allPipelines: PipelineSchema[] = await this.api.Pipelines.all(this.chaoticId, {
          maxPages: 1,
          page: 1,
          perPage: 50,
        });
        allPipelines = allPipelines.filter((pipeline) => pipeline.status !== 'skipped');

        Logger.log(`Fetched ${allPipelines.length} pipelines`, 'GitlabService');
        Logger.debug(allPipelines);

        const fetchPromises: Promise<{ commit: CommitStatusSchema[]; pipeline: PipelineSchema }>[] = [];
        for (const pipeline of allPipelines) {
          this.getCommitStatus(pipeline, fetchPromises);
        }

        const promiseResults: PipelineWithExternalStatus[] = await Promise.all(fetchPromises);
        return promiseResults.sort((a, b) => b.pipeline.id - a.pipeline.id);
      } catch (err) {
        Logger.error(err, 'GitlabService');
      }

      await this.cacheManager.set(this.CACHE_KEY_PIPELINES, data);
    }

    return data;
  }

  /**
   * Bust the cache for the pipelines and refresh available pipelines. Pushes an event to the SSE stream.
   * @param body Body of GitLab API call
   * @returns True if the cache was successfully busted, false otherwise
   */
  async handlePipelineWebhook(body: PipelineWebhook): Promise<boolean> {
    const newData: PipelineWithExternalStatus[] = await this.getLastPipelines(true);

    this.eventService.sseEvents$.next({ data: { type: 'pipeline', pipeline: newData } });
    return true;
  }

  /**
   * Get the open merge requests with their diffs and cache the result.
   * @param overwriteCache Whether to overwrite the cache or not
   * @returns The open merge requests with their diffs
   */
  async getOpenMergeRequests(overwriteCache = false): Promise<any[]> {
    let data: MergeRequestWithDiffs[] | undefined = await this.cacheManager.get<MergeRequestWithDiffs[]>(
      this.CACHE_KEY_MRS,
    );
    if (!data || overwriteCache) {
      const openMrs: MergeRequestSchema[] = await this.api.MergeRequests.all({
        state: 'opened',
        perPage: 100,
        projectId: this.chaoticId,
      });

      Logger.log(`Fetched ${openMrs.length} open MRs`, 'GitlabService');
      Logger.debug(openMrs);

      const diffPromises: Promise<any>[] = [];
      for (const mr of openMrs) {
        diffPromises.push(this.api.MergeRequests.allDiffs(this.chaoticId, mr.iid));
      }

      const diffs = await Promise.all(diffPromises);
      data = openMrs.map((mr, index) => ({
        title: mr.title,
        created_at: mr.created_at,
        web_url: mr.web_url,
        updated_at: mr.updated_at,
        assignees: mr.assignees,
        labels: mr.labels as string[],
        sha: mr.sha,
        merge_status: mr.merge_status,
        iid: mr.iid,
        id: mr.id,
        state: mr.state,
        detailed_merge_status: mr.detailed_merge_status,
        diffs: diffs[index],
      }));

      await this.cacheManager.set(this.CACHE_KEY_MRS, data);
    }

    return data;
  }

  /**
   * Handle a merge request webhook from GitLab, and push an event to the SSE stream.
   * @param body Body of GitLab API call
   */
  async handleMergeRequestWebhook(body: MergeRequestWebhook) {
    const currentData: MergeRequestWithDiffs[] = await this.cacheManager.get<MergeRequestWithDiffs[]>(
      this.CACHE_KEY_MRS,
    );
    const newData: MergeRequestWithDiffs[] = await this.getOpenMergeRequests(true);

    // Determine if there are any new MRs compared to the current cached data
    const currentIds = new Set(currentData?.map((mr) => mr.id) ?? []);
    const newIds = new Set(newData.map((mr) => mr.id));
    const hasNewMr = [...newIds].some((id) => !currentIds.has(id));

    if (hasNewMr) {
      const newMr: MergeRequestWithDiffs[] = newData.filter((mr) => !currentIds.has(mr.id));
      void this.notifySubscribers(newMr);
    }

    this.eventService.sseEvents$.next({ data: { type: 'merge_request', mr: newData, hasNewMr } });
    return true;
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

  /**
   * Notify subscribers about a new merge request via push notifications.
   * @param newMr The new merge request
   */
  private async notifySubscribers(newMr: MergeRequestWithDiffs[]) {
    let subscriber: string;
    try {
      subscriber = await readFile('config/notification-subscriber.json', 'utf-8');
    } catch {
      // No subscribers, nothing to do
      return;
    }

    try {
      const decryptedSubscriber = AES.decrypt(
        subscriber,
        this.configService.getOrThrow<string>('CAUR_DB_KEY'),
      ).toString(enc.Utf8);

      const pkgs = newMr.map((mr) => mr.title.match(/^[^(]*\(([^)]+)\)/)?.[1]).join(', ');
      Logger.log(`Notifying subscribers about new MRs: ${pkgs}`, 'GitlabService');

      const notificationPayload: PushNotification = {
        title: 'New update for review',
        body: `New package updates requires your review: ${pkgs}`,
        icon: '/assets/android-chrome-512x512.png',
        data: {
          url: 'https://chaotic.cx/update-review',
        },
      };

      const promises = [];
      const notificationsJson: PushSubscription[] = JSON.parse(decryptedSubscriber);

      Logger.debug(`Loaded ${notificationsJson.length} subscribers`, 'GitlabService');
      for (const sub of notificationsJson) {
        promises.push(sendNotification(sub, JSON.stringify(notificationPayload)));
      }

      Logger.log(`Sent notifications to ${promises.length} subscribers`, 'GitlabService');
      await Promise.all(promises);
    } catch (error) {
      Logger.error(`Error notifying subscribers: ${error.message ?? error}`, 'GitlabService');
    }
  }
}
