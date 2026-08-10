import {
  CACHE_REVIEW_STATS_TTL,
  MergeRequestWithDiffs,
  NotificationPayload,
  PipelineWithExternalStatus,
} from '@./shared-lib';
import { MergeRequestSchema } from '@gitbeaker/core';
import { CommitStatusSchema, Gitlab, PipelineSchema } from '@gitbeaker/rest';
import { type Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Mutex } from 'async-mutex';
import { AES, enc } from 'crypto-js';
import { readFile } from 'node:fs/promises';
import { PushSubscription, sendNotification } from 'web-push';
import { EventService } from '../events/event.service';
import { GitlabStatusEvent, MergeRequestWebhook, PipelineWebhook } from './interfaces';

@Injectable()
export class GitlabService implements OnModuleInit {
  api: Gitlab;
  updateMutex = new Mutex();
  reviewStatsMutex = new Mutex();

  private readonly CACHE_KEY_MRS = 'gitlab/merge_requests';
  private readonly CACHE_KEY_REVIEW_STATS = 'gitlab/review-stats';
  private readonly chaoticId: string;

  // In-memory representation of the recent pipelines and their external statuses.
  private readonly pipelineMap = new Map<number, PipelineSchema>();
  private readonly statusMap = new Map<number, CommitStatusSchema[]>();
  private statusIdCounter = 0;

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

  async onModuleInit(): Promise<void> {
    await this.refreshReviewStats();
    await this.seedPipelines();
  }

  @Cron(CronExpression.EVERY_6_HOURS)
  async handleReviewStatsRefresh(): Promise<void> {
    await this.refreshReviewStats();
  }

  /**
   * Periodically reconcile the in-memory pipeline store with GitLab as a safety net for missed webhooks
   * or dropped status events.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async handlePipelinesRefresh(): Promise<void> {
    await this.seedPipelines();
  }

  /**
   * Seed the in-memory pipeline store from the GitLab REST API.
   */
  async seedPipelines(): Promise<void> {
    try {
      await this.getPipelinesViaRest();
      Logger.log(`Seeded ${this.pipelineMap.size} pipelines`, 'GitlabService');
    } catch (err) {
      Logger.error(`Failed to seed pipelines: ${(err as Error).message}`, 'GitlabService');
    }
  }

  /**
   * Get the last GitLab pipelines for the chaotic-aur with their external statuses (aka build logs).
   * Returns instantly from the in-memory store, which is kept fresh by webhooks and moleculer events.
   * @returns The last pipelines with their external statuses
   */
  async getLastPipelines(): Promise<PipelineWithExternalStatus[]> {
    return [...this.pipelineMap.entries()]
      .map(([id, pipeline]) => ({ pipeline, commit: this.statusMap.get(id) ?? [] }))
      .sort((a, b) => b.pipeline.id - a.pipeline.id);
  }

  /**
   * Fetch pipelines via the REST API and populate the in-memory store.
   */
  private async getPipelinesViaRest(): Promise<void> {
    let allPipelines: PipelineSchema[] = await this.api.Pipelines.all(this.chaoticId, {
      maxPages: 1,
      page: 1,
      perPage: 50,
    });
    allPipelines = allPipelines.filter((pipeline) => pipeline.status !== 'skipped');

    Logger.log(`Fetched ${allPipelines.length} pipelines`, 'GitlabService');
    Logger.debug(allPipelines);

    const uniqueShas = [...new Set(allPipelines.map((pipeline) => pipeline.sha))];
    const statusesBySha = new Map<string, CommitStatusSchema[]>();
    await Promise.all(
      uniqueShas.map(async (sha) => {
        try {
          const statuses: CommitStatusSchema[] = await this.api.Commits.allStatuses(this.chaoticId, sha);
          statusesBySha.set(
            sha,
            statuses.filter((status) => this.isExternalStage(status.name)),
          );
        } catch (err) {
          Logger.warn(`Failed to fetch statuses for sha ${sha}: ${(err as Error).message}`, 'GitlabService');
          statusesBySha.set(sha, []);
        }
      }),
    );

    this.pipelineMap.clear();
    this.statusMap.clear();
    for (const pipeline of allPipelines) {
      const statuses = statusesBySha.get(pipeline.sha) ?? [];
      this.pipelineMap.set(pipeline.id, pipeline);
      this.statusMap.set(
        pipeline.id,
        statuses.filter((status) => status.pipeline_id === pipeline.id),
      );
    }
  }

  /**
   * Update the in-memory pipeline store from a pipeline webhook and push the refreshed list to the SSE
   * stream.
   * @param body Body of GitLab API call
   * @returns True if the cache was successfully busted, false otherwise
   */
  async handlePipelineWebhook(body: PipelineWebhook): Promise<boolean> {
    const attrs = body.object_attributes;
    const existing = this.pipelineMap.get(attrs.id);
    this.pipelineMap.set(attrs.id, {
      ...existing,
      id: attrs.id,
      status: attrs.status,
      source: attrs.source,
      sha: attrs.sha,
      created_at: attrs.created_at,
      finished_at: attrs.finished_at,
      web_url: attrs.url,
    } as PipelineSchema);

    const pipelines = await this.getLastPipelines();
    this.eventService.sseEvents$.next({ data: { type: 'pipeline', pipeline: pipelines } });
    return true;
  }

  /**
   * Handle an external commit status emitted by chaotic-manager over moleculer. Updates the affected
   * pipeline's statuses in the in-memory store and pushes the refreshed list to the SSE stream.
   * @param event The external status event payload
   */
  async handleExternalStatus(event: GitlabStatusEvent): Promise<void> {
    if (event.pipeline_id === undefined) return;

    const list = this.statusMap.get(event.pipeline_id) ?? [];
    const existingIndex = list.findIndex((status) => status.name === event.name);
    const existing = existingIndex >= 0 ? list[existingIndex] : undefined;

    const entry: CommitStatusSchema = {
      id: existing?.id ?? this.statusIdCounter++,
      name: event.name,
      status: event.status,
      description: event.description,
      target_url: event.target_url,
      started_at: event.started_at ?? existing?.started_at ?? null,
      finished_at: event.finished_at ?? existing?.finished_at ?? null,
      pipeline_id: event.pipeline_id,
    } as unknown as CommitStatusSchema;

    if (existingIndex >= 0) list.splice(existingIndex, 1);
    list.push(entry);
    this.statusMap.set(event.pipeline_id, list);

    const pipelines = await this.getLastPipelines();
    this.eventService.sseEvents$.next({ data: { type: 'pipeline', pipeline: pipelines } });
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
      Logger.debug(openMrs, 'GitlabService');

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
    return await this.updateMutex.runExclusive(async () => {
      const currentData: MergeRequestWithDiffs[] = await this.cacheManager.get<MergeRequestWithDiffs[]>(
        this.CACHE_KEY_MRS,
      );
      const newData: MergeRequestWithDiffs[] = await this.getOpenMergeRequests(true);

      // Wipe reviewer cache since MRs have changed
      await this.cacheManager.del(this.CACHE_KEY_REVIEW_STATS);

      // Determine if there are any new MRs compared to the current cached data
      const currentIds = new Set(currentData?.map((mr) => mr.id) ?? []);
      const newIds = new Set(newData.map((mr) => mr.id));
      const hasNewMr = currentData && [...newIds].some((id) => !currentIds.has(id));

      Logger.debug(`Current MR IDs: ${[...currentIds].join(', ')}`, 'GitlabService');
      Logger.debug(`New MR IDs: ${[...newIds].join(', ')}`, 'GitlabService');
      Logger.log(`Has new MR: ${hasNewMr}`, 'GitlabService');

      if (hasNewMr) {
        const newMr: MergeRequestWithDiffs[] = newData.filter((mr) => !currentIds.has(mr.id));
        void this.notifySubscribers(newMr);
      }

      this.eventService.sseEvents$.next({ data: { type: 'merge_request', mr: newData, hasNewMr } });
      return true;
    });
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

      const pkgs = newMr.map((mr) => mr.title.match(/^chore\(update\): ([\w@.+-]+)$/)?.[1]).join(', ');
      Logger.log(`Notifying subscribers about new MRs: ${pkgs}`, 'GitlabService');

      const notificationPayload: NotificationPayload = {
        notification: {
          title: 'New update for review!',
          icon: '/android-chrome-512x512.png',
          body: `New package updates requires your review: ${pkgs}`,
          data: {
            onActionClick: { default: { operation: 'openWindow', url: 'https://aur.chaotic.cx/update-review' } },
          },
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

  /**
   * Get merge request review statistics per user. Caches the result.
   * @returns An array of usernames and their review counts
   */
  async getReviewStats(): Promise<{ username: string; reviews: number }[]> {
    const cached = await this.cacheManager.get<{ username: string; reviews: number }[]>(this.CACHE_KEY_REVIEW_STATS);
    if (cached) return cached;

    return this.reviewStatsMutex.runExclusive(async () => {
      const again = await this.cacheManager.get<{ username: string; reviews: number }[]>(this.CACHE_KEY_REVIEW_STATS);
      if (again) return again;

      const reviewStats = await this.computeReviewStats();
      await this.cacheManager.set(this.CACHE_KEY_REVIEW_STATS, reviewStats, CACHE_REVIEW_STATS_TTL);
      return reviewStats;
    });
  }

  /**
   * Recompute review stats and refresh the cache, keeping it warm so the first
   * request never blocks on the slow GitLab computation.
   */
  async refreshReviewStats(): Promise<void> {
    try {
      const reviewStats = await this.reviewStatsMutex.runExclusive(async () => {
        const fresh = await this.computeReviewStats();
        await this.cacheManager.set(this.CACHE_KEY_REVIEW_STATS, fresh, CACHE_REVIEW_STATS_TTL);
        return fresh;
      });
      Logger.log(`Refreshed review stats for ${reviewStats.length} users`, 'GitlabService');
    } catch (err) {
      Logger.error(`Failed to refresh review stats: ${(err as Error).message}`, 'GitlabService');
    }
  }

  private async computeReviewStats(): Promise<{ username: string; reviews: number }[]> {
    const users = await this.api.Projects.allUsers(this.chaoticId);

    return mapWithConcurrency(users, 10, async (user) => {
      const mrs = await this.api.MergeRequests.all({
        state: 'merged',
        projectId: this.chaoticId,
        approvedByIds: [user.id],
      });

      Logger.debug(`User ${user.username} has approved ${mrs?.length} MRs`, 'GitlabService');
      return { username: user.username, reviews: mrs.length };
    });
  }

  /**
   * Approves a merge request using the provided token.
   * @param iid The merge request IID.
   * @param sha The merge request SHA.
   * @param token The GitLab private token.
   */
  async approveMergeRequest(iid: number, sha: string, token: string) {
    const userApi = new Gitlab({ token });
    await userApi.MergeRequestApprovals.approve(this.chaoticId, iid, { sha });

    const mr = await userApi.MergeRequests.show(this.chaoticId, iid);
    const labels = (mr.labels as string[]) || [];
    if (!labels.includes('approved')) {
      labels.push('approved');
      await userApi.MergeRequests.edit(this.chaoticId, iid, {
        labels: labels.join(','),
        assigneeId: 20097372, // Marge Bot
      });
    }

    await this.cacheManager.del(this.CACHE_KEY_MRS);
    await this.cacheManager.del(this.CACHE_KEY_REVIEW_STATS);
    void this.getOpenMergeRequests(true);
  }

  /**
   * Flags a merge request with a given label using the provided token.
   * @param iid The merge request IID.
   * @param label The label to add ('dangerous' or 'hold').
   * @param token The GitLab private token.
   */
  async flagMergeRequest(iid: number, label: string, token: string) {
    const userApi = new Gitlab({ token });
    const mr = await userApi.MergeRequests.show(this.chaoticId, iid);
    const labels = (mr.labels as string[]) || [];

    if (!labels.includes(label)) {
      labels.push(label);
      await userApi.MergeRequests.edit(this.chaoticId, iid, {
        labels: labels.join(','),
        // Close right away when dangerous
        stateEvent: labels.includes('dangerous') ? 'close' : undefined,
      });
    }

    await this.cacheManager.del(this.CACHE_KEY_MRS);
    void this.getOpenMergeRequests(true);
  }

  /**
   * Tests the provided GitLab private token for validity and write permissions.
   * @param token The GitLab private token to test.
   * @returns A promise that resolves to true if the token is valid, false otherwise.
   */
  async testToken(token: string): Promise<boolean> {
    const userApi = new Gitlab({ token });
    const labelName = `test-label-${Date.now()}`;
    try {
      await userApi.ProjectLabels.create(this.chaoticId, labelName, '#4287f5');
      await userApi.ProjectLabels.remove(this.chaoticId, labelName);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Map over an array running `mapper` with a bounded concurrency, preserving order.
 */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}
