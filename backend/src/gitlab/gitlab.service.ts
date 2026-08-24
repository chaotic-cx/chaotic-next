import {
  type DiffScanFinding,
  type ExternalCommitStatus,
  GitlabJob,
  GitlabLogChunk,
  type MergeRequestWithDiffs,
  NotificationPayload,
  PipelineOperation,
  PipelineScheduleOption,
  PipelineTriggerResult,
  PipelineWithExternalStatus,
  PKGBUILD_SOURCE_AUR,
  totalEngines,
  type VtIndicatorReport,
} from '@chaotic-next/shared-lib';
import type { MergeRequestDiffSchema } from '@gitbeaker/core';
import { MergeRequestSchema } from '@gitbeaker/core';
import type { CommitStatusSchema } from '@gitbeaker/rest';
import { Gitlab, PipelineSchema } from '@gitbeaker/rest';
import { type Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationShutdown,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Mutex } from 'async-mutex';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Observable } from 'rxjs';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { PushSubscription, sendNotification } from 'web-push';
import { Package, Repo } from '../builder/builder.entity';
import { AurScanService } from '../diff-scan/aur-scan.service';
import { DiffScanService, type DiffScanVerdict, type MrAutoFlagLabel } from '../diff-scan/diff-scan.service';
import { extractIndicators } from '../diff-scan/indicators';
import { VirustotalService } from '../diff-scan/virustotal.service';
import { EventService } from '../events/event.service';
import { NotificationSubscription } from '../notifications/notification-subscription.entity';
import { applyPackageBump } from '../repo-manager/bump/bump-config';
import { cachedResult } from '../utils/cache';
import { MAX_DAYS_WINDOW } from '../utils/constants';
import {
  clampInt,
  decryptAes,
  errorMessage,
  isOnSchedulePipelineRunning,
  mapWithConcurrency,
  nDaysInPast,
  sleep,
} from '../utils/functions';
import { type SseMessage, withSseKeepalive } from '../utils/sse';
import { GitlabStatusEvent, PipelineWebhook } from './interfaces';
import { MrAction, MrActionType } from './mr-action.entity';
import { fetchPackageInfo } from './mr-package-info';
import { PIPELINE_TRIGGERED_BY_VARIABLE } from './pipeline-trigger-inputs';
import { PipelineTrigger } from './pipeline-trigger.entity';

export interface MrActor {
  userId: string;
  userName: string;
}

const TERMINAL_JOB_STATUSES = ['success', 'failed', 'canceled', 'skipped', 'manual', 'waiting_for_resource'];
const SKIPPED_PIPELINE_STATUS = 'skipped';
const JOB_TRACE_POLL_MS = 2000;
const MAX_VERDICT_NOTE_FINDINGS = 5;
const DIFF_FETCH_CONCURRENCY = 5;
const CACHE_MRS_TTL = 30 * 60 * 1000;
const REVIEW_STATS_CACHE_TTL_MS = 60_000;
const PIPELINE_JOBS_CACHE_TTL_MS = 30_000;
const PIPELINE_SCHEDULES_CACHE_TTL_MS = 5 * 60_000;
const MAX_CACHED_PIPELINES = 40;
const GITLAB_API_TIMEOUT_MS = 10_000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const DEFERRED_MERGE_MAX_AGE_DAYS = 1;
const MAX_DEFERRED_MERGE_ATTEMPTS = 5;
const MERGE_STATUS_SETTLE_TIMEOUT_MS = 30_000;
const MERGE_STATUS_SETTLE_POLL_MS = 3_000;
const BLOCKING_MERGE_LABELS = ['malware', 'dangerous', 'hold'] as const;

type DetailedMergeStatus = MergeRequestSchema['detailed_merge_status'] | 'commits_status';

const MERGE_BLOCKER_DESCRIPTIONS: Record<Exclude<DetailedMergeStatus, 'mergeable'>, string> = {
  blocked_status: 'the merge request is blocked',
  broken_status: 'the merge request is in a broken state',
  checking: 'GitLab is still checking mergeability',
  ci_must_pass: 'the CI pipeline must pass before merging',
  ci_still_running: 'the CI pipeline is still running',
  commits_status: 'no pipeline result exists for the head commit yet',
  discussions_not_resolved: 'unresolved discussions block the merge',
  draft_status: 'the merge request is still a draft',
  external_status_checks: 'external status checks block the merge',
  jira_association_missing: 'a Jira association is required',
  not_approved: 'the approval was lost (reset by a push)',
  not_open: 'the merge request is no longer open',
  policies_denied: 'merge policies deny this merge request',
  unchecked: 'GitLab has not yet checked mergeability',
};

function describeMergeBlocker(status?: string): string {
  if (!status) return 'unknown reason';
  return status in MERGE_BLOCKER_DESCRIPTIONS
    ? MERGE_BLOCKER_DESCRIPTIONS[status as keyof typeof MERGE_BLOCKER_DESCRIPTIONS]
    : status;
}

interface CachedMrData {
  updatedAt: string;
  diffs: MergeRequestDiffSchema[];
  scanFindings: DiffScanFinding[];
}

interface JobTraceClient {
  lastOffset: number;
  next: (message: SseMessage<GitlabLogChunk>) => void;
  complete: () => void;
  error: (err: unknown) => void;
}

interface JobTraceEntry {
  clients: Set<JobTraceClient>;
  timer?: ReturnType<typeof setInterval>;
  trace: string;
  status?: string;
}

function toLabelStrings(labels: MergeRequestSchema['labels']): string[] {
  return labels.map((label) => (typeof label === 'string' ? label : label.name));
}

function toMergeRequestWithDiffs(
  mr: MergeRequestSchema,
  diffs: MergeRequestDiffSchema[],
  scanFindings: DiffScanFinding[],
  previous: MergeRequestWithDiffs | undefined,
): MergeRequestWithDiffs {
  return {
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
    diff_refs: mr.diff_refs as MergeRequestWithDiffs['diff_refs'],
    diffs,
    scanFindings,
    ...(previous?.vtReports !== undefined ? { vtReports: previous.vtReports } : {}),
    ...(previous?.maintainers !== undefined ? { maintainers: previous.maintainers } : {}),
    ...(previous?.maintainerChange !== undefined ? { maintainerChange: previous.maintainerChange } : {}),
    ...(previous?.packageInfo !== undefined ? { packageInfo: previous.packageInfo } : {}),
  };
}

function mrStateKey(mr: MergeRequestWithDiffs): string {
  return JSON.stringify([
    mr.id,
    mr.updated_at,
    mr.state,
    mr.detailed_merge_status,
    mr.sha,
    mr.labels,
    mr.scanFindings,
    mr.vtReports,
    mr.maintainers,
    mr.maintainerChange,
    mr.packageInfo,
  ]);
}

function changedMergeRequests(
  current: MergeRequestWithDiffs[] | undefined,
  updated: MergeRequestWithDiffs[],
): MergeRequestWithDiffs[] {
  const currentById = new Map(current?.map((mr) => [mr.id, mr]) ?? []);
  return updated.filter((mr) => {
    const before = currentById.get(mr.id);
    return before === undefined || mrStateKey(before) !== mrStateKey(mr);
  });
}

function mrPkgname(title: string): string | null {
  const match = title.match(/^chore\(update\): ([\w@.+-]+)$/);
  return match ? match[1] : null;
}

@Injectable()
export class GitlabService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(GitlabService.name);
  api!: Gitlab;
  chaoticId!: string;
  updateMutex = new Mutex();
  mergeRequestsMutex = new Mutex();

  private readonly CACHE_KEY_MRS = 'gitlab/merge_requests';
  private readonly CACHE_FILE_PATH = join(process.cwd(), IS_PRODUCTION ? 'backend-config' : 'tmp', 'mr_cache.json');

  private isSeedingPipelines = false;
  private isAutoFlaggingMrs = false;
  private isEnrichingVt = false;

  private readonly vtNotedMrIids = new Set<number>();
  private readonly pendingNotificationIids = new Set<number>();

  private readonly mrDataCache = new Map<number, CachedMrData>();
  private readonly maintainerCheckedAt = new Map<number, string>();
  private lastKnownMrs: MergeRequestWithDiffs[] = [];

  private readonly pipelineMap = new Map<number, PipelineSchema>();
  private readonly statusMap = new Map<number, ExternalCommitStatus[]>();
  private readonly unlinkedCommitShas = new Set<string>();
  private readonly deferredMergeFailures = new Map<number, number>();
  private statusIdCounter = 0;

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly configService: ConfigService,
    private readonly diffScanService: DiffScanService,
    private readonly virustotalService: VirustotalService,
    private readonly aurScanService: AurScanService,
    private readonly eventService: EventService,
    @InjectRepository(NotificationSubscription)
    private readonly subscriptionRepository: Repository<NotificationSubscription>,
    @InjectRepository(MrAction)
    private readonly mrActionRepository: Repository<MrAction>,
    @InjectRepository(PipelineTrigger)
    private readonly pipelineTriggerRepository: Repository<PipelineTrigger>,
    @InjectRepository(Repo)
    private readonly repoRepository: Repository<Repo>,
    @InjectRepository(Package)
    private readonly packageRepository: Repository<Package>,
  ) {}

  private readonly jobTraces = new Map<string, JobTraceEntry>();

  async onModuleInit(): Promise<void> {
    await this.restoreDiskCache().catch((err) =>
      this.logger.warn(`Could not restore MR cache from disk: ${errorMessage(err)}`),
    );
    await this.initApiClient().catch((err) =>
      this.logger.error(`GitLab client init failed, review features unavailable: ${errorMessage(err)}`),
    );
    void this.seedPipelines().catch((err) => this.logger.error(`Initial pipeline seed failed: ${errorMessage(err)}`));
    void this.handleAutoFlagRefresh().catch((err) =>
      this.logger.error(`Initial MR review pre-fetch failed: ${errorMessage(err)}`),
    );
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.log(`Application shutdown signal received (${signal ?? 'unknown'}), saving MR cache to disk...`);
    await this.saveDiskCache().catch((err) =>
      this.logger.error(`Could not persist MR cache to disk on shutdown: ${errorMessage(err)}`),
    );
  }

  private async restoreDiskCache(): Promise<void> {
    if (!existsSync(this.CACHE_FILE_PATH)) return;
    try {
      const raw = await readFile(this.CACHE_FILE_PATH, 'utf-8');
      const mrs = JSON.parse(raw) as MergeRequestWithDiffs[];
      if (Array.isArray(mrs) && mrs.length > 0) {
        await this.cacheManager.set(this.CACHE_KEY_MRS, mrs, CACHE_MRS_TTL);
        this.logger.log(`Restored ${mrs.length} MR(s) from disk cache (${this.CACHE_FILE_PATH})`);
      }
    } catch (err) {
      this.logger.warn(`Failed to parse disk MR cache: ${errorMessage(err)}`);
    }
  }

  private async saveDiskCache(): Promise<void> {
    if (this.lastKnownMrs.length === 0) return;
    try {
      await mkdir(join(process.cwd(), 'tmp'), { recursive: true });
      await writeFile(this.CACHE_FILE_PATH, JSON.stringify(this.lastKnownMrs), 'utf-8');
      this.logger.log(`Persisted ${this.lastKnownMrs.length} MR(s) to disk cache (${this.CACHE_FILE_PATH})`);
    } catch (err) {
      this.logger.error(`Failed to write disk MR cache: ${errorMessage(err)}`);
    }
  }

  private async initApiClient(): Promise<void> {
    const repo = await this.repoRepository.findOne({ where: { name: 'chaotic-aur' } }).catch((err) => {
      this.logger.warn(`Could not load chaotic-aur repo row: ${errorMessage(err)}`);
      return null;
    });
    if (!repo?.gitlabProjectId) {
      throw new Error('No chaotic-aur repo row with gitlabProjectId found; cannot initialise GitLab client');
    }
    this.chaoticId = repo?.gitlabProjectId;

    let token: string | undefined;
    if (repo?.apiToken) {
      try {
        token = decryptAes(repo.apiToken, this.configService.getOrThrow<string>('app.dbKey'));
      } catch (err) {
        this.logger.warn(`Could not decrypt chaotic-aur apiToken: ${errorMessage(err)}`);
      }
    }
    if (!token) {
      throw new Error('No chaotic-aur apiToken configured');
    }

    this.api = new Gitlab({ token });
  }

  /**
   * Processes deferred MR merges right after the scheduled pipeline window (HH:30 - HH:40) ends.
   * Runs at minutes 41, 43, and 45 every 3 hours UTC. Stops retrying an MR after
   * repeated failures.
   */
  @Cron('41,43,45 */3 * * *')
  async processDeferredMerges(): Promise<void> {
    if (isOnSchedulePipelineRunning()) return;

    try {
      const recentApprovedActions = await this.mrActionRepository.find({
        where: { action: 'approve', createdAt: MoreThan(nDaysInPast(DEFERRED_MERGE_MAX_AGE_DAYS)) },
        order: { createdAt: 'DESC' },
        take: 50,
      });

      if (recentApprovedActions.length === 0) return;

      const openMrs = await this.api.MergeRequests.all({ state: 'opened', projectId: this.chaoticId });
      const openMrsByIid = new Map(openMrs.map((mr) => [mr.iid, mr]));

      let mergedCount = 0;
      const processedIids = new Set<number>();
      for (const action of recentApprovedActions) {
        if (processedIids.has(action.mergeRequestIid)) continue;
        processedIids.add(action.mergeRequestIid);

        const openMr = openMrsByIid.get(action.mergeRequestIid);
        if (!openMr) {
          this.deferredMergeFailures.delete(action.mergeRequestIid);
          continue;
        }

        const failedAttempts = this.deferredMergeFailures.get(action.mergeRequestIid) ?? 0;
        if (failedAttempts >= MAX_DEFERRED_MERGE_ATTEMPTS) {
          this.deferredMergeFailures.delete(action.mergeRequestIid);
          await this.abandonDeferredMerge(action.mergeRequestIid);
          continue;
        }

        const labels = toLabelStrings(openMr.labels);
        const blockingLabel = labels.find((label) => BLOCKING_MERGE_LABELS.includes(label as never));
        if (blockingLabel !== undefined) {
          this.logger.warn(
            `The service skips the deferred merge of MR !${action.mergeRequestIid}. It has the label "${blockingLabel}".`,
          );
          continue;
        }

        this.logger.log(`Processing deferred merge for MR !${action.mergeRequestIid} after scheduled pipeline run`);
        try {
          await this.mergeWithRetry(action.mergeRequestIid, openMr.sha ?? action.commitSha ?? '');
          mergedCount++;
          this.deferredMergeFailures.delete(action.mergeRequestIid);
        } catch (err) {
          this.deferredMergeFailures.set(action.mergeRequestIid, failedAttempts + 1);
          this.logger.error(`Failed to execute deferred merge for MR !${action.mergeRequestIid}: ${errorMessage(err)}`);
        }
      }

      if (mergedCount > 0) {
        await this.cacheManager.del(this.CACHE_KEY_MRS);
        void this.refreshOpenMergeRequests();
      }
    } catch (err) {
      this.logger.debug(`Could not query database for deferred MR merges: ${errorMessage(err)}`);
    }
  }

  private async abandonDeferredMerge(iid: number): Promise<void> {
    this.logger.error(
      `The deferred merge of MR !${iid} failed ${MAX_DEFERRED_MERGE_ATTEMPTS} times. The service stops retrying it.`,
    );
    try {
      await this.api.MergeRequestNotes.create(
        this.chaoticId,
        iid,
        `⚠️ The automatic merge failed ${MAX_DEFERRED_MERGE_ATTEMPTS} times. A maintainer must merge this merge request manually.`,
      );
    } catch (err) {
      this.logger.warn(`Could not mark MR !${iid} as abandoned: ${errorMessage(err)}`);
    }
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async handleAutoFlagRefresh(): Promise<void> {
    if (this.isAutoFlaggingMrs) {
      this.logger.debug('Auto-flag refresh already running, skipping');
      return;
    }
    this.isAutoFlaggingMrs = true;

    try {
      this.logger.debug('Starting auto-flag refresh');
      const mrs = await this.getOpenMergeRequests(true);
      await this.autoFlagMergeRequests(mrs);

      void this.enrichVirusTotalReports(mrs).catch((err) =>
        this.logger.error(`VirusTotal enrichment failed: ${errorMessage(err)}`),
      );
      void this.enrichMaintainerInfo(mrs).catch((err) =>
        this.logger.error(`Maintainer enrichment failed: ${errorMessage(err)}`),
      );
      void this.enrichPackageInfo(mrs).catch((err) =>
        this.logger.error(`Package info enrichment failed: ${errorMessage(err)}`),
      );

      await this.flushDeferredNotifications();
    } catch (err) {
      this.logger.error(`Auto-flag refresh failed: ${errorMessage(err)}`);
    } finally {
      this.isAutoFlaggingMrs = false;
    }
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
      .filter(([, pipeline]) => pipeline.status !== SKIPPED_PIPELINE_STATUS)
      .map(([id, pipeline]) => ({ pipeline, commit: this.statusMap.get(id) ?? [] }))
      .sort((a, b) => b.pipeline.id - a.pipeline.id)
      .slice(0, MAX_CACHED_PIPELINES);
  }

  private async getPipelinesViaRest(): Promise<void> {
    let allPipelines: PipelineSchema[] = await this.api.Pipelines.all(this.chaoticId, {
      maxPages: 2,
      perPage: 100,
    });
    allPipelines = allPipelines
      .filter((pipeline) => pipeline.status !== SKIPPED_PIPELINE_STATUS)
      .slice(0, MAX_CACHED_PIPELINES);

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
      // Webhooks omit updated_at — fall back to created_at to keep the column populated.
      updated_at: existing?.updated_at ?? attrs.created_at,
      web_url: attrs.url,
    });

    if (this.pipelineMap.size > MAX_CACHED_PIPELINES) {
      const sortedIds = [...this.pipelineMap.keys()].sort((a, b) => b - a);
      for (const oldId of sortedIds.slice(MAX_CACHED_PIPELINES)) {
        this.pipelineMap.delete(oldId);
        this.statusMap.delete(oldId);
      }
    }

    if (attrs.sha && this.unlinkedCommitShas.has(attrs.sha)) {
      await this.pipelineTriggerRepository.update(
        { commitSha: attrs.sha, pipelineId: IsNull() },
        { pipelineId: attrs.id },
      );
      this.unlinkedCommitShas.delete(attrs.sha);
    } else if (attrs.source === 'schedule') {
      // Fallback: link to the most recent unlinked RUN_SCHEDULE trigger when the API didn't return pipeline info
      const unlinked = await this.pipelineTriggerRepository.findOne({
        where: { operation: PipelineOperation.RUN_SCHEDULE, pipelineId: IsNull(), ref: attrs.ref },
        order: { createdAt: 'DESC' },
      });
      if (unlinked) {
        await this.pipelineTriggerRepository.update(unlinked.id, { pipelineId: attrs.id, commitSha: attrs.sha });
      }
    }

    if (attrs.sha) {
      const trigger = await this.pipelineTriggerRepository.findOne({
        where: { pipelineId: attrs.id, commitSha: IsNull() },
      });
      if (trigger) {
        await this.pipelineTriggerRepository.update(trigger.id, { commitSha: attrs.sha });
      }
    }

    const pipelines = await this.getLastPipelines();
    this.eventService.sseEvents$.next({ data: { type: 'pipeline', pipeline: pipelines } });
    return true;
  }

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
    return this.mergeRequestsMutex.runExclusive(async () => {
      if (!overwriteCache) {
        const cached = await this.cacheManager.get<MergeRequestWithDiffs[]>(this.CACHE_KEY_MRS);
        if (cached) {
          this.logger.debug('Serving open MRs from cache');
          return cached;
        }
      }
      this.logger.debug(overwriteCache ? 'Forcing refresh of open MRs' : 'No cached MRs, fetching open MRs');

      const openMrs: MergeRequestSchema[] = await this.api.MergeRequests.all({
        state: 'opened',
        perPage: 100,
        projectId: this.chaoticId,
      });
      this.logger.log(`Fetched ${openMrs.length} open MRs`);

      const openIids = new Set(openMrs.map((mr) => mr.iid));
      for (const iid of this.mrDataCache.keys()) {
        if (!openIids.has(iid)) this.mrDataCache.delete(iid);
      }

      const staleMrs = openMrs.filter((mr) => {
        const cached = this.mrDataCache.get(mr.iid);
        return cached === undefined || cached.updatedAt !== mr.updated_at;
      });
      this.logger.log(`Fetching diffs for ${staleMrs.length} of ${openMrs.length} open MRs`);

      // One MR whose diff fails to load (e.g. a transient GitLab 500) must not fail
      // the whole batch: its diffs just come back empty.
      const diffsByIid = new Map<number, MergeRequestDiffSchema[]>();
      await mapWithConcurrency(
        staleMrs,
        async (mr) => {
          const diffs = await this.api.MergeRequests.allDiffs(this.chaoticId, mr.iid).catch((err: unknown) => {
            this.logger.warn(`Failed to fetch diffs for MR !${mr.iid}: ${errorMessage(err)}`);
            return [];
          });
          diffsByIid.set(mr.iid, diffs);
        },
        DIFF_FETCH_CONCURRENCY,
      );

      // Enrichment (VirusTotal/maintainers) lives on the previous snapshot and must
      // survive rebuilds, otherwise the enrichment crons would redo all lookups.
      const previous = await this.cacheManager.get<MergeRequestWithDiffs[]>(this.CACHE_KEY_MRS);
      const previousById = new Map(previous?.map((mr) => [mr.id, mr]) ?? []);

      const data = await Promise.all(
        openMrs.map(async (mr) => {
          const previousMr = previousById.get(mr.id);
          const cached = this.mrDataCache.get(mr.iid);
          if (cached !== undefined && cached.updatedAt === mr.updated_at) {
            return toMergeRequestWithDiffs(mr, cached.diffs, cached.scanFindings, previousMr);
          }
          const diffs = diffsByIid.get(mr.iid) ?? [];
          const scanFindings = await this.diffScanService.scanDiffs(diffs);
          this.mrDataCache.set(mr.iid, { updatedAt: mr.updated_at, diffs, scanFindings });
          const ruleIds = [...new Set(scanFindings.map((finding) => finding.ruleId))];
          this.logger.debug(
            `MR !${mr.iid}: ${diffs.length} changed file(s), ${scanFindings.length} finding(s)` +
              (ruleIds.length > 0 ? ` [${ruleIds.join(', ')}]` : ''),
          );
          return toMergeRequestWithDiffs(mr, diffs, scanFindings, previousMr);
        }),
      );

      this.lastKnownMrs = data;
      await this.cacheManager.set(this.CACHE_KEY_MRS, data, CACHE_MRS_TTL);

      void this.enrichPackageInfo(data).catch((err) =>
        this.logger.error(`Package info enrichment failed: ${errorMessage(err)}`),
      );

      return data;
    });
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

      const currentIds = new Set(currentData?.map((mr) => mr.id) ?? []);
      const newIds = new Set(newData.map((mr) => mr.id));
      const hasNewMr = currentData !== undefined && [...newIds].some((id) => !currentIds.has(id));

      this.logger.debug(`Current MR IDs: ${[...currentIds].join(', ')}`);
      this.logger.debug(`New MR IDs: ${[...newIds].join(', ')}`);
      this.logger.log(`Has new MR: ${hasNewMr}`);

      await this.autoFlagMergeRequests(newData).catch((err) =>
        this.logger.error(`Auto-flagging after MR webhook failed: ${errorMessage(err)}`),
      );

      if (hasNewMr) {
        const newMr: MergeRequestWithDiffs[] = newData.filter((mr) => !currentIds.has(mr.id));
        void this.notifySubscribers(newMr);
      }

      await this.flushDeferredNotifications();

      this.eventService.sseEvents$.next({
        data: { type: 'merge_request', mr: changedMergeRequests(currentData, newData), hasNewMr },
      });
      return true;
    });
  }

  async autoFlagMergeRequests(mrs: MergeRequestWithDiffs[]): Promise<void> {
    let changed = false;
    const flaggedMrs: MergeRequestWithDiffs[] = [];

    for (const mr of mrs) {
      const verdict = this.diffScanService.autoFlagVerdict(mr.scanFindings);
      if (!verdict) {
        if (mr.scanFindings && mr.scanFindings.length > 0) {
          this.logger.debug(`MR !${mr.iid}: scan score below label thresholds, leaving unlabelled`);
        }
        continue;
      }
      if (this.hasAutoFlagLabel(mr.labels, verdict.label)) {
        this.logger.debug(
          `MR !${mr.iid}: verdict ${verdict.label} (score ${verdict.score}), label already present, skipping`,
        );
        continue;
      }
      this.logger.debug(`MR !${mr.iid}: applying verdict ${verdict.label} (scan score ${verdict.score})`);

      try {
        // addLabels only appends; sending the full list would race against label
        // changes since our snapshot was taken and could wipe e.g. human-review.
        await this.api.MergeRequests.edit(this.chaoticId, mr.iid, {
          addLabels: verdict.label,
        });
        mr.labels.push(verdict.label);
        flaggedMrs.push(mr);
        changed = true;
        this.logger.warn(`Auto-flagged MR !${mr.iid} as ${verdict.label} (scan score ${verdict.score})`);
        await this.postScanVerdictComments(mr, verdict);
      } catch (err) {
        this.logger.warn(`Could not auto-flag MR !${mr.iid}: ${errorMessage(err)}`);
      }
    }

    if (changed) {
      await this.cacheManager.set(this.CACHE_KEY_MRS, mrs);
      this.eventService.sseEvents$.next({ data: { type: 'merge_request', mr: flaggedMrs, hasNewMr: false } });
    }
  }

  private hasAutoFlagLabel(labels: string[], label: MrAutoFlagLabel): boolean {
    if (labels.includes(label)) return true;
    return label === 'suspicious' && labels.includes('malware');
  }

  private async postScanVerdictComments(mr: MergeRequestWithDiffs, verdict: DiffScanVerdict): Promise<void> {
    const refs = mr.diff_refs ?? null;
    if (!refs) {
      await this.postScanVerdictNote(mr.iid, verdict, verdict.findings);
      return;
    }

    const anchorCandidates = verdict.findings
      .filter((finding): finding is DiffScanFinding & { line: number } => finding.line !== undefined)
      .slice(0, MAX_VERDICT_NOTE_FINDINGS);
    const attempted = new Set<DiffScanFinding>(anchorCandidates);
    const summary = verdict.findings.filter((finding) => !attempted.has(finding));

    for (const finding of anchorCandidates) {
      const body = [
        `🤖 **${finding.ruleId} — ${finding.ruleName}** (${finding.severity})`,
        '',
        finding.description,
      ].join('\n');
      try {
        await this.api.MergeRequestDiscussions.create(this.chaoticId, mr.iid, body, {
          position: {
            positionType: 'text',
            baseSha: refs.base_sha,
            startSha: refs.start_sha,
            headSha: refs.head_sha,
            oldPath: finding.file,
            newPath: finding.file,
            newLine: String(finding.line),
          },
        });
      } catch (err) {
        // Findings that cannot be anchored inline still belong in the summary note.
        summary.push(finding);
        this.logger.warn(`Could not anchor finding ${finding.ruleId} on MR !${mr.iid}: ${errorMessage(err)}`);
      }
    }

    await this.postScanVerdictNote(mr.iid, verdict, summary);
  }

  private async postScanVerdictNote(iid: number, verdict: DiffScanVerdict, findings: DiffScanFinding[]): Promise<void> {
    const bullets = findings.map(
      (finding) =>
        `- **${finding.severity}** ${finding.ruleId} ${finding.ruleName} — \`${finding.file}${finding.line !== undefined ? `:${finding.line}` : ''}\``,
    );
    await this.api.MergeRequestNotes.create(
      this.chaoticId,
      iid,
      [
        `🤖 **Automated security scan**: score ${verdict.score}, added label \`${verdict.label}\`.`,
        '',
        ...bullets,
      ].join('\n'),
    );
  }

  /**
   * Checks the indicators of flagged MRs against VirusTotal in the background.
   * Reports only surface in the UI and as MR notes; they never influence labels.
   */
  private async enrichVirusTotalReports(mrs: MergeRequestWithDiffs[]): Promise<void> {
    if (!this.virustotalService.enabled) {
      this.logger.debug('VirusTotal disabled (no API key), skipping enrichment');
      return;
    }
    if (this.isEnrichingVt) {
      this.logger.debug('VirusTotal enrichment already running, skipping');
      return;
    }
    this.isEnrichingVt = true;

    try {
      for (const mr of mrs) {
        if (!mr.scanFindings || mr.scanFindings.length === 0) continue;
        if (mr.vtReports !== undefined) {
          this.logger.debug(`MR !${mr.iid}: VirusTotal reports already present, skipping`);
          continue;
        }
        const indicators = extractIndicators(mr.diffs);
        if (indicators.length === 0) {
          this.logger.debug(`MR !${mr.iid}: no indicators worth checking on VirusTotal`);
          continue;
        }

        this.logger.debug(`MR !${mr.iid}: checking ${indicators.length} indicator(s) on VirusTotal`);
        const reports = await this.virustotalService.reportOn(indicators);
        mr.vtReports = reports;
        if (reports.length === 0) {
          this.logger.debug(`MR !${mr.iid}: no VirusTotal reports (lookups failed or nothing known)`);
          continue;
        }
        this.logger.debug(
          `MR !${mr.iid}: VirusTotal verdicts: ${reports.map((report) => `${report.type}=${report.verdict}`).join(', ')}`,
        );
        await this.cacheManager.set(this.CACHE_KEY_MRS, mrs);
        this.eventService.sseEvents$.next({ data: { type: 'merge_request', mr: [mr], hasNewMr: false } });

        const notable = reports.filter((report) => report.verdict === 'malicious' || report.verdict === 'suspicious');
        if (notable.length > 0 && !this.vtNotedMrIids.has(mr.iid)) {
          this.logger.debug(`MR !${mr.iid}: posting VirusTotal note for ${notable.length} notable report(s)`);
          if (await this.postVirusTotalNote(mr.iid, notable)) {
            this.vtNotedMrIids.add(mr.iid);
          }
        }
      }
    } finally {
      this.isEnrichingVt = false;
    }
  }

  /** A package is only re-checked while its MR keeps changing; a takeover on a dormant MR resurfaces with new activity. */
  private async enrichMaintainerInfo(mrs: MergeRequestWithDiffs[]): Promise<void> {
    const pending = mrs.filter((mr) => {
      const pkgname = mrPkgname(mr.title);
      return pkgname !== null && mr.maintainers === undefined && this.maintainerCheckedAt.get(mr.iid) !== mr.updated_at;
    });
    const pkgnames = [...new Set(pending.map((mr) => mrPkgname(mr.title) as string))];
    if (pkgnames.length === 0) return;

    let changed = false;
    const changedMrs: MergeRequestWithDiffs[] = [];
    try {
      const statuses = await this.aurScanService.maintainerStatusFor(pkgnames);
      for (const mr of pending) {
        const pkgname = mrPkgname(mr.title) as string;
        const status = statuses.get(pkgname);
        if (!status) {
          this.logger.debug(`MR !${mr.iid}: "${pkgname}" not found in the AUR, skipping maintainer info`);
          continue;
        }

        this.maintainerCheckedAt.set(mr.iid, mr.updated_at);
        mr.maintainers = status.maintainers;
        mr.maintainerChange = status.change ?? undefined;
        changedMrs.push(mr);
        changed = true;
        if (status.change) {
          this.logger.warn(
            `MR !${mr.iid}: maintainer change on ${pkgname}: +${status.change.added.join(', ') || 'none'} / -${status.change.removed.join(', ') || 'none'}`,
          );
        }
      }
    } catch (err) {
      this.logger.warn(`Maintainer lookup for ${pkgnames.length} package(s) failed: ${errorMessage(err)}`);
    }

    const openIids = new Set(mrs.map((mr) => mr.iid));
    for (const iid of this.maintainerCheckedAt.keys()) {
      if (!openIids.has(iid)) this.maintainerCheckedAt.delete(iid);
    }

    if (changed) {
      await this.cacheManager.set(this.CACHE_KEY_MRS, mrs);
      this.eventService.sseEvents$.next({ data: { type: 'merge_request', mr: changedMrs, hasNewMr: false } });
    }
  }

  private async enrichPackageInfo(mrs: MergeRequestWithDiffs[]): Promise<void> {
    const pending = mrs.filter((mr) => mrPkgname(mr.title) !== null && mr.packageInfo === undefined);
    if (pending.length === 0) return;

    const byPkgname = new Map<string, MergeRequestWithDiffs[]>();
    for (const mr of pending) {
      const pkgname = mrPkgname(mr.title) as string;
      const group = byPkgname.get(pkgname) ?? [];
      group.push(mr);
      byPkgname.set(pkgname, group);
    }

    const changedMrs: MergeRequestWithDiffs[] = [];
    for (const [pkgname, mrsForPkg] of byPkgname) {
      const info = await fetchPackageInfo(this.api, this.chaoticId, pkgname, this.logger);
      if (!info) continue;
      for (const mr of mrsForPkg) {
        mr.packageInfo = info;
        changedMrs.push(mr);
      }
    }

    if (changedMrs.length === 0) return;
    await this.cacheManager.set(this.CACHE_KEY_MRS, mrs);
    this.eventService.sseEvents$.next({ data: { type: 'merge_request', mr: changedMrs, hasNewMr: false } });
  }

  private async postVirusTotalNote(iid: number, reports: VtIndicatorReport[]): Promise<boolean> {
    const bullets = reports.map((report) => {
      const engines = report.stats
        ? ` — ${report.stats.malicious + report.stats.suspicious}/${totalEngines(report.stats)} engines flagged`
        : '';
      return `- **${report.verdict}** ${report.type} \`${report.value}\`${engines} (${report.context})`;
    });
    try {
      await this.api.MergeRequestNotes.create(
        this.chaoticId,
        iid,
        [
          `🤖 **VirusTotal**: ${reports.length} indicator(s) from this MR were flagged by VirusTotal.`,
          '',
          ...bullets,
        ].join('\n'),
      );
      this.logger.debug(`Posted VirusTotal note on MR !${iid}`);
      return true;
    } catch (err) {
      this.logger.warn(`Could not post VirusTotal note on MR !${iid}: ${errorMessage(err)}`);
      return false;
    }
  }

  private isExternalStage(name: string): boolean {
    return name.startsWith('chaotic-aur:') || name.startsWith('garuda:');
  }

  private async notifySubscribers(newMr: MergeRequestWithDiffs[]) {
    try {
      const scannable = newMr.filter((mr) => mr.diffs.length > 0);
      for (const mr of newMr) {
        if (mr.diffs.length === 0) this.pendingNotificationIids.add(mr.iid);
      }
      const deferred = newMr.length - scannable.length;
      if (deferred > 0) {
        this.logger.warn(`Deferred notifying about ${deferred} new MR(s): their diffs were unavailable`);
      }
      if (scannable.length === 0) return;

      const subscriptions = await this.subscriptionRepository.find();
      if (subscriptions.length === 0) return;

      const summaries = scannable
        .map((mr) => {
          const pkg = mr.title.match(/^chore\(update\): ([\w@.+-]+)$/)?.[1];
          if (pkg === undefined) return null;
          const findings = mr.scanFindings?.length ?? 0;
          if (findings === 0) return pkg;
          const detail = findings === 1 ? '1 finding' : `${findings} findings`;
          return `${pkg} (${detail})`;
        })
        .filter((summary): summary is string => summary !== undefined)
        .join(', ');
      this.logger.log(`Notifying subscribers about new MRs: ${summaries}`);

      const iids = scannable.map((mr) => mr.iid).join(',');
      const targetUrl = `https://aur.chaotic.cx/update-review?newMr=${iids}`;
      const notificationPayload: NotificationPayload = {
        notification: {
          title: 'New update for review!',
          icon: '/android-chrome-512x512.png',
          body: `Updates awaiting your review: ${summaries}`,
          data: { onActionClick: { default: { operation: 'navigateLastFocusedOrOpen', url: targetUrl } } },
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

  private async flushDeferredNotifications(): Promise<void> {
    if (this.pendingNotificationIids.size === 0) return;

    const mrs = await this.getOpenMergeRequests(false);
    const byIid = new Map(mrs.map((mr) => [mr.iid, mr]));

    const ready: MergeRequestWithDiffs[] = [];
    for (const iid of this.pendingNotificationIids) {
      const mr = byIid.get(iid);
      if (!mr || mr.diffs.length > 0) this.pendingNotificationIids.delete(iid);
      if (mr?.diffs.length) ready.push(mr);
    }

    if (ready.length === 0) return;
    this.logger.log(`Flushing ${ready.length} deferred new-MR notification(s) whose diffs are available now`);
    await this.notifySubscribers(ready);
  }

  async getReviewStats(days?: number): Promise<{ username: string; reviews: number }[]> {
    const clampedDays = days === undefined ? 'all' : clampInt(days, 1, MAX_DAYS_WINDOW);
    return cachedResult(
      this.cacheManager,
      `gitlab:review-stats:${clampedDays}`,
      REVIEW_STATS_CACHE_TTL_MS,
      async () => {
        const rows = await this.reviewStatsBaseQuery(days)
          .select('mr.userName', 'username')
          .addSelect('COUNT(*)', 'reviews')
          .groupBy('mr.userName')
          .getRawMany();
        return rows.map((row) => ({ username: String(row.username), reviews: Number(row.reviews) }));
      },
    );
  }

  async getReviewStatsOverTime(days?: number): Promise<{ date: string; username: string; reviews: number }[]> {
    const clampedDays = days === undefined ? 'all' : clampInt(days, 1, MAX_DAYS_WINDOW);
    return cachedResult(
      this.cacheManager,
      `gitlab:review-stats-over-time:${clampedDays}`,
      REVIEW_STATS_CACHE_TTL_MS,
      async () => {
        const dateExpr = `TO_CHAR(mr.createdAt AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;
        const rows = await this.reviewStatsBaseQuery(days)
          .select(dateExpr, 'date')
          .addSelect('mr.userName', 'username')
          .addSelect('COUNT(*)', 'reviews')
          .groupBy(dateExpr)
          .addGroupBy('mr.userName')
          .orderBy('date', 'ASC')
          .getRawMany();
        return rows.map((row) => ({
          date: String(row.date),
          username: String(row.username),
          reviews: Number(row.reviews),
        }));
      },
    );
  }

  /** Base query over recorded approval actions, optionally restricted to the last `days`. */
  private reviewStatsBaseQuery(days?: number) {
    const query = this.mrActionRepository.createQueryBuilder('mr').where('mr.action = :action', { action: 'approve' });
    if (days !== undefined) {
      query.andWhere('mr.createdAt >= :cutoff', { cutoff: nDaysInPast(clampInt(days, 1, MAX_DAYS_WINDOW)) });
    }
    return query;
  }

  private assertApiReady(): void {
    if (!this.api) {
      throw new ServiceUnavailableException(
        'GitLab client is not initialised; GitLab integration features are unavailable.',
      );
    }
  }

  async approveMergeRequest(iid: number, sha: string, actor: MrActor): Promise<{ deferred: boolean }> {
    const mr = await this.api.MergeRequests.show(this.chaoticId, iid);
    const labels = toLabelStrings(mr.labels);
    if (labels.includes('malware')) {
      throw new BadRequestException(
        'This merge request is flagged as malware by the automated security scan and requires manual review.',
      );
    }
    const targetSha = mr.sha ?? sha;
    await this.api.MergeRequestApprovals.approve(this.chaoticId, iid, { sha: targetSha });

    if (!labels.includes('approved')) {
      await this.api.MergeRequests.edit(this.chaoticId, iid, {
        addLabels: 'approved',
      });
    }

    await this.postActorComment(iid, '✅ Approved by', actor);
    await this.recordMrAction(iid, 'approve', targetSha, actor);

    const deferred = isOnSchedulePipelineRunning();
    if (deferred) {
      this.logger.log(
        `MR !${iid} approved while scheduled pipeline is running. Merge will be executed once the scheduled pipeline completes.`,
      );
    } else {
      await this.mergeWithRetry(iid, targetSha);
    }
    await this.cacheManager.del(this.CACHE_KEY_MRS);

    void this.refreshOpenMergeRequests();
    return { deferred };
  }

  /**
   * Merges an MR, and reacts to GitLab's `detailed_merge_status` instead of blindly
   * retrying. It approves again when a push reset the approval. The server-side merge
   * method does the rebasing.
   */
  private async mergeWithRetry(iid: number, sha: string): Promise<void> {
    try {
      try {
        await this.api.MergeRequests.accept(this.chaoticId, iid, { sha });
        return;
      } catch (error) {
        this.logger.warn(`Initial merge failed for MR !${iid}: ${errorMessage(error)}`);
      }

      const mr = await this.waitForSettledMergeStatus(iid);
      const headSha = mr.sha ?? sha;

      if (await this.hasNoChanges(iid)) {
        await this.closeEmptyMergeRequest(iid);
        return;
      }

      if (mr.detailed_merge_status === 'mergeable') {
        await this.api.MergeRequests.accept(this.chaoticId, iid, { sha: headSha });
        return;
      }

      if (mr.detailed_merge_status === 'not_approved') {
        await this.reApproveAndMerge(iid, headSha);
        return;
      }

      throw new BadRequestException(`Cannot merge MR !${iid}: ${describeMergeBlocker(mr.detailed_merge_status)}`);
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException(`Could not merge MR !${iid}: ${errorMessage(err)}`);
    }
  }

  private async reApproveAndMerge(iid: number, headSha: string): Promise<void> {
    this.logger.warn(`The approval of MR !${iid} was lost, for example after a push. The service approves it again.`);
    await this.api.MergeRequestApprovals.approve(this.chaoticId, iid, { sha: headSha });
    await this.api.MergeRequests.accept(this.chaoticId, iid, { sha: headSha });
  }

  private async hasNoChanges(iid: number): Promise<boolean> {
    try {
      const diffs = await this.api.MergeRequests.allDiffs(this.chaoticId, iid);
      return diffs.length === 0;
    } catch (err) {
      this.logger.warn(`Could not fetch diffs of MR !${iid}: ${errorMessage(err)}`);
      return false;
    }
  }

  private async closeEmptyMergeRequest(iid: number): Promise<void> {
    this.logger.log(`MR !${iid} contains no changes against its target branch. The service closes it.`);
    try {
      await this.api.MergeRequests.edit(this.chaoticId, iid, { stateEvent: 'close' });
      await this.api.MergeRequestNotes.create(
        this.chaoticId,
        iid,
        '🔒 Closed automatically: the target branch already contains this change.',
      );
    } catch (err) {
      throw new BadRequestException(`Could not close empty MR !${iid}: ${errorMessage(err)}`);
    }
    throw new BadRequestException(`MR !${iid} contains no changes against its target branch. The service closed it.`);
  }

  private async waitForSettledMergeStatus(iid: number): Promise<MergeRequestSchema> {
    return this.pollMrUntil(iid, MERGE_STATUS_SETTLE_TIMEOUT_MS, (mr) => {
      const status = mr.detailed_merge_status;
      return status !== 'checking' && status !== 'unchecked';
    });
  }

  private async pollMrUntil(
    iid: number,
    timeoutMs: number,
    settled: (mr: MergeRequestSchema) => boolean,
  ): Promise<MergeRequestSchema> {
    const deadline = Date.now() + timeoutMs;
    let mr = await this.api.MergeRequests.show(this.chaoticId, iid);
    while (!settled(mr) && Date.now() < deadline) {
      await sleep(MERGE_STATUS_SETTLE_POLL_MS);
      mr = await this.api.MergeRequests.show(this.chaoticId, iid);
    }
    return mr;
  }

  async flagMergeRequest(iid: number, label: MrActionType, actor: MrActor): Promise<void> {
    const mr = await this.api.MergeRequests.show(this.chaoticId, iid);
    const labels = toLabelStrings(mr.labels);

    if (!labels.includes(label)) {
      await this.api.MergeRequests.edit(this.chaoticId, iid, {
        addLabels: label,
        stateEvent: label === 'dangerous' ? 'close' : undefined,
      });
    }

    const comment = label === 'dangerous' ? '🚨 Flagged as dangerous by' : '⏸️ Put on hold by';
    await this.postActorComment(iid, comment, actor);
    await this.recordMrAction(iid, label, mr.sha ?? null, actor);
    await this.cacheManager.del(this.CACHE_KEY_MRS);
    void this.refreshOpenMergeRequests();
  }

  private async postActorComment(iid: number, prefix: string, actor: MrActor): Promise<void> {
    await this.api.MergeRequestNotes.create(this.chaoticId, iid, `**${prefix}** ${actor.userName}.`);
  }

  private async recordMrAction(
    iid: number,
    action: MrActionType,
    commitSha: string | null,
    actor: MrActor,
  ): Promise<void> {
    await this.mrActionRepository.insert({ mergeRequestIid: iid, action, commitSha, ...actor });
  }

  async listPipelineSchedules(repoName: string): Promise<PipelineScheduleOption[]> {
    const gitlabProjectId = await this.getRepoGitlabProjectId(repoName);
    return cachedResult(
      this.cacheManager,
      `gitlab:schedules:${repoName}`,
      PIPELINE_SCHEDULES_CACHE_TTL_MS,
      async () => {
        const schedules = await this.api.PipelineSchedules.all(gitlabProjectId, { perPage: 100 });
        return schedules.map((schedule) => ({
          id: schedule.id,
          description: schedule.description ?? null,
          active: schedule.active,
        }));
      },
    );
  }

  async getDecryptedToken(repoName: string): Promise<string> {
    const repo = await this.repoRepository.findOne({ where: { name: repoName } });
    if (!repo?.apiToken) {
      throw new ServiceUnavailableException(`Repo ${repoName} has no apiToken`);
    }
    return decryptAes(repo.apiToken, this.configService.getOrThrow<string>('app.dbKey'));
  }

  async getHeadCommitForRepo(repoName: string, ref = 'main'): Promise<string> {
    const repo = await this.repoRepository.findOne({ where: { name: repoName } });
    if (!repo?.gitlabProjectId) {
      throw new ServiceUnavailableException(`Repo ${repoName} has no gitlabProjectId`);
    }
    const token = await this.getDecryptedToken(repoName);
    return this.fetchHeadCommitFromApi(repo.gitlabProjectId, ref, token);
  }

  private async fetchHeadCommitFromApi(projectId: string, ref: string, token?: string): Promise<string> {
    const url = `https://gitlab.com/api/v4/projects/${encodeURIComponent(projectId)}/repository/commits?ref_name=${encodeURIComponent(ref)}&per_page=1`;
    const headers: Record<string, string> = {};
    if (token) {
      headers['PRIVATE-TOKEN'] = token;
    }
    const response = await fetch(url, { signal: AbortSignal.timeout(GITLAB_API_TIMEOUT_MS), headers });
    if (!response.ok) {
      throw new ServiceUnavailableException(`GitLab API returned ${response.status} for project ${projectId}`);
    }
    const commits = (await response.json()) as { id: string }[];
    const head = commits[0];
    if (!head?.id) {
      throw new ServiceUnavailableException('Could not fetch HEAD commit from GitLab');
    }
    return head.id;
  }

  async runSchedule(scheduleId: number, repoName: string, actor: MrActor): Promise<PipelineTriggerResult> {
    const gitlabProjectId = await this.getRepoGitlabProjectId(repoName);
    let lastPipeline: { id?: number; sha?: string } | undefined;

    if (scheduleId > 0) {
      this.logger.debug(`Triggering pipeline schedule #${scheduleId} on ${repoName}...`);
      const schedules = this.api.PipelineSchedules as unknown as Record<string, (...args: unknown[]) => unknown>;
      let result: unknown;
      if (typeof schedules.play === 'function') {
        result = await schedules.play(gitlabProjectId, scheduleId);
      } else if (typeof schedules.take === 'function') {
        result = await schedules.take(gitlabProjectId, scheduleId);
      } else {
        result = await (this.api as unknown as { requester: { post: (...args: unknown[]) => unknown } }).requester.post(
          `projects/${encodeURIComponent(gitlabProjectId)}/pipeline_schedules/${scheduleId}/play`,
        );
      }

      const body = result as {
        data?: { last_pipeline?: { id?: number; sha?: string } };
        last_pipeline?: { id?: number; sha?: string };
      };
      lastPipeline = body?.data?.last_pipeline ?? body?.last_pipeline;
    }

    const pipelineId = lastPipeline?.id ?? null;
    const commitSha = lastPipeline?.sha ?? null;
    const webUrl = pipelineId
      ? `${gitlabProjectId}/-/pipelines/${pipelineId}`
      : `${gitlabProjectId}/pipeline_schedules`;

    if (commitSha) {
      this.unlinkedCommitShas.add(commitSha);
    }

    await this.pipelineTriggerRepository.insert({
      ref: 'main',
      commitSha,
      operation: PipelineOperation.RUN_SCHEDULE,
      inputs: { scheduleId: String(scheduleId), repo: repoName },
      pipelineId,
      webUrl,
      ...actor,
    });

    return { pipelineId: pipelineId ?? 0, webUrl, status: 'scheduled' };
  }

  async dropPackages(
    packages: string[],
    repoName: string,
    ref: string,
    actor: MrActor,
  ): Promise<PipelineTriggerResult> {
    const commitActions: { action: 'delete'; filePath: string }[] = [];
    const gitlabProjectId = await this.getRepoGitlabProjectId(repoName);

    for (const rawPkg of packages) {
      const pkgname = rawPkg.trim();
      if (!pkgname) continue;
      try {
        const treeItems = await this.api.Repositories.allRepositoryTrees(gitlabProjectId, {
          path: pkgname,
          ref,
          recursive: true,
          pagination: 'keyset',
          orderBy: 'name',
          sort: 'asc',
        });

        // Deleting all files inside a directory automatically removes the directory in Git.
        const filesToDelete = treeItems.filter((item: { type: string; path: string }) => item.type === 'blob');
        if (filesToDelete.length > 0) {
          for (const file of filesToDelete) {
            commitActions.push({
              action: 'delete',
              filePath: (file as { path: string }).path,
            });
          }
        } else {
          commitActions.push({
            action: 'delete',
            filePath: `${pkgname}/.CI/config`,
          });
        }
      } catch {
        commitActions.push({
          action: 'delete',
          filePath: `${pkgname}/.CI/config`,
        });
      }
    }

    const subject =
      packages.length > 3 ? `chore(drop): packages (${packages.length})` : `chore(drop): ${packages.join(', ')}`;
    const commitMessage = `${subject}\n\nDropped manually by ${actor.userName}`;

    const commit = await this.api.Commits.create(gitlabProjectId, ref, commitMessage, commitActions);

    if (commit.id) {
      this.unlinkedCommitShas.add(commit.id);
    }
    await this.pipelineTriggerRepository.insert({
      ref,
      commitSha: commit.id,
      operation: PipelineOperation.DROP_PACKAGES,
      inputs: { packages: packages.join(':') },
      pipelineId: null,
      webUrl: commit.web_url ?? '',
      ...actor,
    });

    return { pipelineId: 0, webUrl: commit.web_url ?? '', status: 'committed' };
  }

  async addPackages(
    items: { pkgname: string; source?: string }[],
    repoName: string,
    requestOrigin: string,
    ref: string,
    actor: MrActor,
    requestReason?: string,
    customRequestReason?: string,
  ): Promise<PipelineTriggerResult> {
    const itemNames = items.map((i) => i.pkgname);
    this.logger.debug(`Processing package addition for [${itemNames.join(', ')}] on ref ${ref} by ${actor.userName}`);
    const commitActions: { action: 'create' | 'update'; filePath: string; content: string }[] = [];
    const gitlabProjectId = await this.getRepoGitlabProjectId(repoName);

    for (const item of items) {
      const pkgname = item.pkgname.trim();
      if (!pkgname) continue;
      const source = item.source ?? PKGBUILD_SOURCE_AUR;
      this.logger.debug(`Fetching AUR metadata and PKGBUILD for ${pkgname} (source: ${source})`);

      const configLines = [`CI_PKGBUILD_SOURCE=${source}`];
      if (requestOrigin && requestOrigin.trim()) {
        configLines.push(`CI_REQUEST_ORIGIN=${requestOrigin.trim()}`);
      }
      if (requestReason && requestReason !== 'unset') {
        configLines.push(`CI_REQUEST_REASON=${requestReason.trim()}`);
      }
      if (customRequestReason && customRequestReason.trim()) {
        configLines.push(`CI_CUSTOM_REQUEST_REASON=${customRequestReason.trim()}`);
      }
      const ciConfigContent = `${configLines.join('\n')}\n`;

      try {
        const pkgbuildScan = await this.aurScanService.startScan(pkgname);
        const pkgbuildText = await this.fetchAurPkgbuildText(pkgbuildScan.packageBase || pkgname);

        commitActions.push({
          action: 'create',
          filePath: `${pkgname}/.CI/config`,
          content: ciConfigContent,
        });

        if (pkgbuildText) {
          this.logger.debug(`Successfully fetched PKGBUILD for ${pkgname} (${pkgbuildText.length} bytes)`);
          commitActions.push({
            action: 'create',
            filePath: `${pkgname}/PKGBUILD`,
            content: pkgbuildText,
          });
        } else {
          this.logger.debug(`No PKGBUILD content returned for ${pkgname}`);
        }

        for (const file of pkgbuildScan.sourceFiles ?? []) {
          if (file.name === 'PKGBUILD') continue;
          this.logger.debug(`Adding auxiliary source file ${file.name} (${file.content.length} bytes) for ${pkgname}`);
          commitActions.push({
            action: 'create',
            filePath: `${pkgname}/${file.name}`,
            content: file.content,
          });
        }
      } catch (err) {
        this.logger.warn(`Could not fetch AUR sources for ${pkgname}: ${errorMessage(err)}`);
        commitActions.push({
          action: 'create',
          filePath: `${pkgname}/.CI/config`,
          content: ciConfigContent,
        });
      }
    }

    const subject =
      itemNames.length > 3 ? `feat(add): packages (${itemNames.length})` : `feat(add): ${itemNames.join(', ')}`;
    const commitMessage = `${subject}\n\nAdded manually by ${actor.userName}`;

    this.logger.debug(`Creating GitLab commit with ${commitActions.length} actions for [${itemNames.join(', ')}]`);
    const commit = await this.api.Commits.create(gitlabProjectId, ref, commitMessage, commitActions);

    this.logger.log(
      `Package(s) added successfully: [${itemNames.join(', ')}] by ${actor.userName} (commit: ${commit.id}, url: ${commit.web_url})`,
    );

    if (commit.id) {
      this.unlinkedCommitShas.add(commit.id);
    }
    await this.pipelineTriggerRepository.insert({
      ref,
      commitSha: commit.id,
      operation: PipelineOperation.ADD_PACKAGES,
      inputs: { add_packages: itemNames.join(' '), request_origin: requestOrigin },
      pipelineId: null,
      webUrl: commit.web_url ?? '',
      ...actor,
    });

    return { pipelineId: 0, webUrl: commit.web_url ?? '', status: 'committed' };
  }

  private async getRepoGitlabProjectId(repoName: string): Promise<string> {
    const repo = await this.repoRepository.findOne({ where: { name: repoName } });
    if (!repo?.gitlabProjectId) {
      throw new NotFoundException(`Repository '${repoName}' not found or has no GitLab project ID`);
    }
    return repo.gitlabProjectId;
  }

  async bumpPackages(
    packages: string[],
    repoName: string,
    ref: string,
    actor: MrActor,
  ): Promise<PipelineTriggerResult> {
    const commitActions: { action: 'update' | 'create'; filePath: string; content: string }[] = [];
    const gitlabProjectId = await this.getRepoGitlabProjectId(repoName);

    for (const pkg of packages) {
      const pkgname = pkg.trim();
      if (!pkgname) continue;
      const configPath = `${pkgname}/.CI/config`;
      let existingConfig = '';

      try {
        const raw = await this.api.RepositoryFiles.showRaw(gitlabProjectId, configPath, ref);
        if (typeof raw === 'string') {
          existingConfig = raw;
        } else if (raw && typeof (raw as { text?: () => Promise<string> }).text === 'function') {
          existingConfig = await (raw as { text: () => Promise<string> }).text();
        } else if (raw) {
          existingConfig = String(raw);
        }
      } catch {
        // File may not exist yet
      }

      const dbPkg = await this.packageRepository.findOne({ where: { pkgname } });
      if (!dbPkg) {
        throw new NotFoundException(`Package '${pkgname}' not found`);
      }

      const version = dbPkg.version;
      const pkgrel = dbPkg.pkgrel;

      const updatedConfig = applyPackageBump(existingConfig, version, pkgrel);
      commitActions.push({
        action: existingConfig ? 'update' : 'create',
        filePath: configPath,
        content: updatedConfig,
      });
    }

    const subject =
      packages.length > 3 ? `chore(bump): packages (${packages.length})` : `chore(bump): ${packages.join(', ')}`;
    const commitMessage = `${subject}\n\nBumped manually by ${actor.userName}`;

    const commit = await this.api.Commits.create(gitlabProjectId, ref, commitMessage, commitActions);

    if (commit.id) {
      this.unlinkedCommitShas.add(commit.id);
    }
    await this.pipelineTriggerRepository.insert({
      ref,
      commitSha: commit.id,
      operation: PipelineOperation.BUMP_PACKAGES,
      inputs: { packages: packages.join(':') },
      pipelineId: null,
      webUrl: commit.web_url ?? '',
      ...actor,
    });

    return { pipelineId: 0, webUrl: commit.web_url ?? '', status: 'committed' };
  }

  async triggerPipelineRun(
    inputs: Record<string, string>,
    ref: string,
    actor: MrActor,
  ): Promise<PipelineTriggerResult> {
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
      commitSha: pipeline.sha ?? null,
      operation: inputs.operation,
      inputs,
      pipelineId: pipeline.id,
      webUrl: pipeline.web_url,
      ...actor,
    });

    return { pipelineId: pipeline.id, webUrl: pipeline.web_url, status: pipeline.status };
  }

  private async fetchAurPkgbuildText(packageBase: string): Promise<string | null> {
    try {
      const response = await fetch(
        `https://aur.archlinux.org/cgit/aur.git/plain/PKGBUILD?h=${encodeURIComponent(packageBase)}`,
      );
      if (response.ok) return await response.text();
    } catch {
      // Fallback null
    }
    return null;
  }

  async listPipelineJobs(pipelineId: number): Promise<GitlabJob[]> {
    return cachedResult(
      this.cacheManager,
      `gitlab:pipeline-jobs:${pipelineId}`,
      PIPELINE_JOBS_CACHE_TTL_MS,
      async () => {
        const jobs = await this.api.Jobs.all(this.chaoticId, { pipelineId });
        return jobs.map((job) => ({
          id: job.id,
          name: job.name,
          stage: job.stage,
          status: job.status,
          ref: job.ref,
          webUrl: job.web_url,
          startedAt: job.started_at,
          finishedAt: job.finished_at,
          duration: job.duration,
        }));
      },
    );
  }

  /**
   * Streams a job's trace over SSE. One shared polling loop feeds every viewer
   * of the same job: GitLab's trace is fetched as a whole, so the poller keeps
   * the latest trace and forwards each client only the bytes appended after its
   * own offset, ending with a `complete` message once the job reaches a terminal
   * status. The polling stops when the job finishes or the last client leaves.
   */
  getJobTraceStream(pipelineId: number, jobId: number, resumeAt = 0): Observable<SseMessage<GitlabLogChunk>> {
    const key = `${pipelineId}:${jobId}`;
    return withSseKeepalive(
      new Observable<SseMessage<GitlabLogChunk>>((subscriber) => {
        const client: JobTraceClient = {
          // Seeds from the resume point so a reconnecting client only receives
          // bytes appended after its last received chunk.
          lastOffset: Math.max(resumeAt, 0),
          next: (message) => subscriber.next(message),
          complete: () => subscriber.complete(),
          error: (err) => subscriber.error(err),
        };
        this.attachJobTraceClient(key, jobId, client);
        return () => this.detachJobTraceClient(key, client);
      }),
    );
  }

  private attachJobTraceClient(key: string, jobId: number, client: JobTraceClient): void {
    let entry = this.jobTraces.get(key);
    if (!entry) {
      entry = { clients: new Set(), trace: '', status: undefined };
      this.jobTraces.set(key, entry);
      entry.timer = setInterval(() => void this.pollJobTrace(key, jobId), JOB_TRACE_POLL_MS);
      void this.pollJobTrace(key, jobId);
    } else {
      // Catch a mid-stream joiner up from the buffered trace immediately.
      this.sendJobTraceChunk(entry, client);
    }
    entry.clients.add(client);
  }

  private detachJobTraceClient(key: string, client: JobTraceClient): void {
    const entry = this.jobTraces.get(key);
    if (!entry) return;
    entry.clients.delete(client);
    if (entry.clients.size === 0) this.disposeJobTrace(key);
  }

  private sendJobTraceChunk(entry: JobTraceEntry, client: JobTraceClient): void {
    if (entry.trace.length <= client.lastOffset) return;
    const offset = entry.trace.length;
    // The id carries the offset so the browser's native EventSource reconnect
    // resumes via Last-Event-ID without manual bookkeeping.
    client.next({
      id: String(offset),
      data: { offset, text: entry.trace.slice(client.lastOffset), complete: false, status: entry.status ?? '' },
    });
    client.lastOffset = offset;
  }

  private async pollJobTrace(key: string, jobId: number): Promise<void> {
    const entry = this.jobTraces.get(key);
    if (!entry) return;

    try {
      this.assertApiReady();
      const { api, chaoticId } = this;
      const job = await api.Jobs.show(chaoticId, jobId);
      entry.status = job.status;
      entry.trace = await api.Jobs.showLog(chaoticId, jobId);

      for (const client of [...entry.clients]) {
        this.sendJobTraceChunk(entry, client);
        if (TERMINAL_JOB_STATUSES.includes(entry.status)) {
          client.next({
            data: { offset: client.lastOffset, text: '', complete: true, status: entry.status ?? '' },
          });
          client.complete();
        }
      }
      if (TERMINAL_JOB_STATUSES.includes(entry.status)) this.disposeJobTrace(key);
    } catch (error) {
      for (const client of [...entry.clients]) client.error(error);
      this.disposeJobTrace(key);
    }
  }

  private disposeJobTrace(key: string): void {
    const entry = this.jobTraces.get(key);
    if (!entry) return;
    if (entry.timer !== undefined) clearInterval(entry.timer);
    this.jobTraces.delete(key);
  }
}
