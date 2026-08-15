import {
  CACHE_REVIEW_STATS_TTL,
  type ExternalCommitStatus,
  MergeRequestWithDiffs,
  NotificationPayload,
  PipelineScheduleOption,
  PipelineTriggerResult,
  PipelineWithExternalStatus,
} from '@chaotic-next/shared-lib';
import { MergeRequestDiffSchema, MergeRequestSchema } from '@gitbeaker/core';
import type { CommitStatusSchema } from '@gitbeaker/rest';
import { Gitlab, PipelineSchema } from '@gitbeaker/rest';
import { type Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Mutex } from 'async-mutex';
import { decryptAes, errorMessage, mapWithConcurrency } from '../utils/functions';
import { Repository } from 'typeorm';
import { PushSubscription, sendNotification } from 'web-push';
import { EventService } from '../events/event.service';
import { NotificationSubscription } from '../notifications/notification-subscription.entity';
import { GitlabStatusEvent, PipelineWebhook } from './interfaces';
import { MrAction, MrActionType } from './mr-action.entity';
import { PipelineTrigger } from './pipeline-trigger.entity';
import { PIPELINE_TRIGGERED_BY_VARIABLE } from './pipeline-trigger-inputs';
import { Repo } from '../builder/builder.entity';

export interface MrActor {
  userId: string;
  userName: string;
}

@Injectable()
export class GitlabService implements OnModuleInit {
  private readonly logger = new Logger(GitlabService.name);
  api!: Gitlab;
  updateMutex = new Mutex();
  reviewStatsMutex = new Mutex();

  private readonly CACHE_KEY_MRS = 'gitlab/merge_requests';
  private readonly CACHE_KEY_REVIEW_STATS = 'gitlab/review-stats';
  private chaoticId!: string;
  private readonly mergeBotUserId: number;

  private readonly pipelineMap = new Map<number, PipelineSchema>();
  private readonly statusMap = new Map<number, ExternalCommitStatus[]>();
  private statusIdCounter = 0;

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly configService: ConfigService,
    private readonly eventService: EventService,
    @InjectRepository(NotificationSubscription)
    private readonly subscriptionRepository: Repository<NotificationSubscription>,
    @InjectRepository(MrAction)
    private readonly mrActionRepository: Repository<MrAction>,
    @InjectRepository(PipelineTrigger)
    private readonly pipelineTriggerRepository: Repository<PipelineTrigger>,
    @InjectRepository(Repo)
    private readonly repoRepository: Repository<Repo>,
  ) {
    this.mergeBotUserId = this.configService.getOrThrow<number>('app.mergeBotUserId');
  }

  async onModuleInit(): Promise<void> {
    await this.initApiClient().catch((err) =>
      this.logger.error(`GitLab client init failed, review features unavailable: ${errorMessage(err)}`),
    );
    // Fire-and-forget: never block application startup on GitLab seeding.
    // The cron jobs (EVERY_6_HOURS / EVERY_10_MINUTES) reconcile the store as
    // a safety net if the initial seed races or fails.
    void this.refreshReviewStats().catch((err) =>
      this.logger.error(`Initial review-stats refresh failed: ${errorMessage(err)}`),
    );
    void this.seedPipelines().catch((err) => this.logger.error(`Initial pipeline seed failed: ${errorMessage(err)}`));
  }

  /**
   * Source everything from the chaotic-aur repo row in the DB: the project id,
   * the token (encrypted at rest). Falls back to env config when the repo row
   * is missing or misconfigured so app startup never fails.
   */
  private async initApiClient(): Promise<void> {
    const repo = await this.repoRepository.findOne({ where: { name: 'chaotic-aur' } }).catch((err) => {
      this.logger.warn(`Could not load chaotic-aur repo row: ${errorMessage(err)}`);
      return null;
    });
    const gitlabProjectId = repo?.gitlabProjectId ?? this.configService.get<string>('CAUR_GITLAB_ID_CAUR');
    if (!gitlabProjectId) {
      throw new Error('No chaotic-aur repo row with gitlabProjectId found; cannot initialise GitLab client');
    }
    this.chaoticId = gitlabProjectId;

    let token: string | undefined;
    if (repo?.apiToken) {
      try {
        token = decryptAes(repo.apiToken, this.configService.getOrThrow<string>('app.dbKey'));
      } catch (err) {
        this.logger.warn(`Could not decrypt chaotic-aur apiToken: ${errorMessage(err)}`);
      }
    }
    token ??= this.configService.get<string>('CAUR_GITLAB_TOKEN');
    if (!token) {
      throw new Error('No chaotic-aur apiToken and no CAUR_GITLAB_TOKEN configured');
    }
    this.api = new Gitlab({ token });
  }

  @Cron(CronExpression.EVERY_6_HOURS)
  async handleReviewStatsRefresh(): Promise<void> {
    await this.refreshReviewStats();
  }

  /** Safety net for missed webhooks / dropped status events. */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async handlePipelinesRefresh(): Promise<void> {
    await this.seedPipelines();
  }

  async seedPipelines(): Promise<void> {
    try {
      await this.getPipelinesViaRest();
      this.logger.log(`Seeded ${this.pipelineMap.size} pipelines`);
    } catch (err) {
      this.logger.error(`Failed to seed pipelines: ${errorMessage(err)}`);
    }
  }

  async getLastPipelines(): Promise<PipelineWithExternalStatus[]> {
    return [...this.pipelineMap.entries()]
      .map(([id, pipeline]) => ({ pipeline, commit: this.statusMap.get(id) ?? [] }))
      .sort((a, b) => b.pipeline.id - a.pipeline.id);
  }

  private async getPipelinesViaRest(): Promise<void> {
    let allPipelines: PipelineSchema[] = await this.api.Pipelines.all(this.chaoticId, {
      maxPages: 1,
      page: 1,
      perPage: 50,
    });
    allPipelines = allPipelines.filter((pipeline) => pipeline.status !== 'skipped');

    this.logger.log(`Fetched ${allPipelines.length} pipelines`);

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
          this.logger.warn(`Failed to fetch statuses for sha ${sha}: ${errorMessage(err)}`);
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
        statuses
          .filter((status) => status.pipeline_id === pipeline.id)
          .map((status) => this.toExternalStatus(pipeline.id, status)),
      );
    }
  }

  private toExternalStatus(pipelineId: number, status: CommitStatusSchema): ExternalCommitStatus {
    return {
      id: status.id,
      name: status.name,
      status: status.status,
      description: status.description ?? null,
      target_url: status.target_url,
      started_at: status.started_at ?? null,
      finished_at: status.finished_at ?? null,
      pipeline_id: pipelineId,
    };
  }

  /** Update the store from a webhook, then push the refreshed list to SSE. */
  async handlePipelineWebhook(body: PipelineWebhook): Promise<boolean> {
    const attrs = body.object_attributes;
    const existing = this.pipelineMap.get(attrs.id);
    this.pipelineMap.set(attrs.id, {
      ...existing,
      id: attrs.id,
      iid: attrs.iid,
      project_id: existing?.project_id ?? body.project?.id ?? 0,
      ref: attrs.ref,
      status: attrs.status,
      source: attrs.source,
      sha: attrs.sha,
      created_at: attrs.created_at,
      // Webhooks don't carry updated_at; the fallback keeps the schema complete.
      updated_at: existing?.updated_at ?? attrs.created_at,
      web_url: attrs.url,
    });

    const pipelines = await this.getLastPipelines();
    this.eventService.sseEvents$.next({ data: { type: 'pipeline', pipeline: pipelines } });
    return true;
  }

  /** Handle a chaotic-manager commit status: update the store, push to SSE. */
  async handleExternalStatus(event: GitlabStatusEvent): Promise<void> {
    if (event.pipeline_id === undefined) return;

    const list = this.statusMap.get(event.pipeline_id) ?? [];
    const existingIndex = list.findIndex((status) => status.name === event.name);
    const existing = existingIndex >= 0 ? list[existingIndex] : undefined;

    const entry: ExternalCommitStatus = {
      id: existing?.id ?? this.statusIdCounter++,
      name: event.name,
      status: event.status,
      description: event.description ?? null,
      target_url: event.target_url,
      started_at: event.started_at ?? existing?.started_at ?? null,
      finished_at: event.finished_at ?? existing?.finished_at ?? null,
      pipeline_id: event.pipeline_id,
    };

    if (existingIndex >= 0) list.splice(existingIndex, 1);
    list.push(entry);
    this.statusMap.set(event.pipeline_id, list);

    const pipelines = await this.getLastPipelines();
    this.eventService.sseEvents$.next({ data: { type: 'pipeline', pipeline: pipelines } });
  }

  async getOpenMergeRequests(overwriteCache = false): Promise<MergeRequestWithDiffs[]> {
    let data: MergeRequestWithDiffs[] | undefined = await this.cacheManager.get<MergeRequestWithDiffs[]>(
      this.CACHE_KEY_MRS,
    );
    if (!data || overwriteCache) {
      const openMrs: MergeRequestSchema[] = await this.api.MergeRequests.all({
        state: 'opened',
        perPage: 100,
        projectId: this.chaoticId,
      });

      this.logger.log(`Fetched ${openMrs.length} open MRs`);

      const diffPromises: Promise<MergeRequestDiffSchema[]>[] = [];
      for (const mr of openMrs) {
        // One MR whose diff fails to load (e.g. a transient GitLab 500) must
        // not fail the whole batch: its diffs just come back empty.
        diffPromises.push(
          this.api.MergeRequests.allDiffs(this.chaoticId, mr.iid).catch((err: unknown) => {
            this.logger.warn(`Failed to fetch diffs for MR !${mr.iid}: ${errorMessage(err)}`);
            return [];
          }),
        );
      }

      const diffs = await Promise.all(diffPromises);
      data = openMrs.map((mr, index) => ({
        title: mr.title,
        created_at: mr.created_at,
        web_url: mr.web_url,
        updated_at: mr.updated_at,
        assignees: mr.assignees,
        labels: toLabelStrings(mr.labels),
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

  private async refreshOpenMergeRequests(): Promise<void> {
    try {
      await this.getOpenMergeRequests(true);
    } catch (err) {
      this.logger.error(`Failed to refresh merge requests: ${errorMessage(err)}`);
    }
  }

  async handleMergeRequestWebhook() {
    return await this.updateMutex.runExclusive(async () => {
      const currentData: MergeRequestWithDiffs[] | undefined = await this.cacheManager.get<MergeRequestWithDiffs[]>(
        this.CACHE_KEY_MRS,
      );
      const newData: MergeRequestWithDiffs[] = await this.getOpenMergeRequests(true);

      // Wipe reviewer cache since MRs have changed
      await this.cacheManager.del(this.CACHE_KEY_REVIEW_STATS);

      // Determine if there are any new MRs compared to the current cached data
      const currentIds = new Set(currentData?.map((mr) => mr.id) ?? []);
      const newIds = new Set(newData.map((mr) => mr.id));
      const hasNewMr = currentData !== undefined && [...newIds].some((id) => !currentIds.has(id));

      this.logger.debug(`Current MR IDs: ${[...currentIds].join(', ')}`);
      this.logger.debug(`New MR IDs: ${[...newIds].join(', ')}`);
      this.logger.log(`Has new MR: ${hasNewMr}`);

      if (hasNewMr) {
        const newMr: MergeRequestWithDiffs[] = newData.filter((mr) => !currentIds.has(mr.id));
        void this.notifySubscribers(newMr);
      }

      this.eventService.sseEvents$.next({ data: { type: 'merge_request', mr: newData, hasNewMr } });
      return true;
    });
  }

  private isExternalStage(name: string): boolean {
    return name.startsWith('chaotic-aur:') || name.startsWith('garuda:');
  }

  private async notifySubscribers(newMr: MergeRequestWithDiffs[]) {
    try {
      const subscriptions = await this.subscriptionRepository.find();
      if (subscriptions.length === 0) {
        // No subscribers, nothing to do
        return;
      }

      const pkgs = newMr
        .map((mr) => mr.title.match(/^chore\(update\): ([\w@.+-]+)$/)?.[1])
        .filter((name): name is string => name !== undefined)
        .join(', ');
      this.logger.log(`Notifying subscribers about new MRs: ${pkgs}`);

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

      const promises = subscriptions.map((sub) => {
        const pushSubscription: PushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        };
        return sendNotification(pushSubscription, JSON.stringify(notificationPayload));
      });

      this.logger.log(`Sent notifications to ${promises.length} subscribers`);
      const results = await Promise.allSettled(promises);
      const failed = results.filter((result) => result.status === 'rejected').length;
      if (failed > 0) {
        this.logger.warn(`${failed} of ${results.length} push notifications failed`);
      }
    } catch (error) {
      this.logger.error(`Error notifying subscribers: ${errorMessage(error)}`);
    }
  }

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

  async refreshReviewStats(): Promise<void> {
    try {
      const reviewStats = await this.reviewStatsMutex.runExclusive(async () => {
        const fresh = await this.computeReviewStats();
        await this.cacheManager.set(this.CACHE_KEY_REVIEW_STATS, fresh, CACHE_REVIEW_STATS_TTL);
        return fresh;
      });
      this.logger.log(`Refreshed review stats for ${reviewStats.length} users`);
    } catch (err) {
      this.logger.error(`Failed to refresh review stats: ${errorMessage(err)}`);
    }
  }

  private async computeReviewStats(): Promise<{ username: string; reviews: number }[]> {
    const users = await this.api.Projects.allUsers(this.chaoticId);

    return mapWithConcurrency(
      users,
      async (user) => {
        const mrs = await this.api.MergeRequests.all({
          state: 'merged',
          projectId: this.chaoticId,
          approvedByIds: [user.id],
        });

        return { username: user.username, reviews: mrs.length };
      },
      10,
    );
  }

  async approveMergeRequest(iid: number, sha: string, actor: MrActor): Promise<void> {
    const mr = await this.api.MergeRequests.show(this.chaoticId, iid);
    await this.api.MergeRequestApprovals.approve(this.chaoticId, iid, { sha: mr.sha ?? sha });

    const labels = toLabelStrings(mr.labels);
    if (!labels.includes('approved')) {
      labels.push('approved');
      await this.api.MergeRequests.edit(this.chaoticId, iid, {
        labels: labels.join(','),
        assigneeId: this.mergeBotUserId,
      });
    }

    await this.postActorComment(iid, '✅ Approved by', actor);
    await this.recordMrAction(iid, 'approve', actor);
    await this.cacheManager.del(this.CACHE_KEY_MRS);
    await this.cacheManager.del(this.CACHE_KEY_REVIEW_STATS);
    void this.refreshOpenMergeRequests();
  }

  async flagMergeRequest(iid: number, label: MrActionType, actor: MrActor): Promise<void> {
    const mr = await this.api.MergeRequests.show(this.chaoticId, iid);
    const labels = toLabelStrings(mr.labels);

    if (!labels.includes(label)) {
      labels.push(label);
      await this.api.MergeRequests.edit(this.chaoticId, iid, {
        labels: labels.join(','),
        // Close right away when dangerous
        stateEvent: labels.includes('dangerous') ? 'close' : undefined,
      });
    }

    const comment = label === 'dangerous' ? '🚨 Flagged as dangerous by' : '⏸️ Put on hold by';
    await this.postActorComment(iid, comment, actor);
    await this.recordMrAction(iid, label, actor);
    await this.cacheManager.del(this.CACHE_KEY_MRS);
    void this.refreshOpenMergeRequests();
  }

  private async postActorComment(iid: number, prefix: string, actor: MrActor): Promise<void> {
    await this.api.MergeRequestNotes.create(this.chaoticId, iid, `**${prefix}** ${actor.userName}.`);
  }

  private async recordMrAction(iid: number, action: MrActionType, actor: MrActor): Promise<void> {
    await this.mrActionRepository.insert({ mergeRequestIid: iid, action, ...actor });
  }

  /** Pipeline schedules of the chaotic-aur project, for the Run Schedule operation. */
  async listPipelineSchedules(): Promise<PipelineScheduleOption[]> {
    const schedules = await this.api.PipelineSchedules.all(this.chaoticId, { perPage: 100 });
    return schedules.map((schedule) => ({
      id: schedule.id,
      description: schedule.description ?? null,
      active: schedule.active,
    }));
  }

  /**
   * Triggers a pipeline run with the given spec:inputs, carrying the triggering
   * user into the pipeline as a CI variable, and records an audit row.
   */
  async triggerPipeline(inputs: Record<string, string>, ref: string, actor: MrActor): Promise<PipelineTriggerResult> {
    const pipeline = await this.api.Pipelines.create(this.chaoticId, ref, {
      inputs,
      variables: [
        {
          key: PIPELINE_TRIGGERED_BY_VARIABLE,
          value: `${actor.userName} (${actor.userId})`,
          variable_type: 'env_var',
        },
      ],
    });

    await this.pipelineTriggerRepository.insert({
      ref,
      operation: inputs.operation,
      inputs,
      pipelineId: pipeline.id,
      webUrl: pipeline.web_url,
      ...actor,
    });

    return { pipelineId: pipeline.id, webUrl: pipeline.web_url, status: pipeline.status };
  }
}

function toLabelStrings(labels: MergeRequestSchema['labels']): string[] {
  return labels.map((label) => (typeof label === 'string' ? label : label.name));
}
