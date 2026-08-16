import {
  CACHE_REVIEW_STATS_TTL,
  type DiffScanFinding,
  type ExternalCommitStatus,
  GitlabJob,
  GitlabLogChunk,
  MergeRequestWithDiffs,
  NotificationPayload,
  PipelineScheduleOption,
  PipelineTriggerResult,
  PipelineWithExternalStatus,
  totalEngines,
  type VtIndicatorReport,
} from '@chaotic-next/shared-lib';
import type { MergeRequestDiffSchema } from '@gitbeaker/core';
import { MergeRequestSchema } from '@gitbeaker/core';
import type { CommitStatusSchema } from '@gitbeaker/rest';
import { Gitlab, PipelineSchema } from '@gitbeaker/rest';
import { type Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import { BadRequestException, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Mutex } from 'async-mutex';
import { Observable } from 'rxjs';
import { Repository } from 'typeorm';
import { PushSubscription, sendNotification } from 'web-push';
import { Repo } from '../builder/builder.entity';
import { AurScanService } from '../diff-scan/aur-scan.service';
import { DiffScanService, type DiffScanVerdict, type MrAutoFlagLabel } from '../diff-scan/diff-scan.service';
import { extractIndicators } from '../diff-scan/indicators';
import { VirustotalService } from '../diff-scan/virustotal.service';
import { EventService } from '../events/event.service';
import { NotificationSubscription } from '../notifications/notification-subscription.entity';
import { decryptAes, errorMessage, mapWithConcurrency } from '../utils/functions';
import { GitlabStatusEvent, PipelineWebhook } from './interfaces';
import { MrAction, MrActionType } from './mr-action.entity';
import { PIPELINE_TRIGGERED_BY_VARIABLE } from './pipeline-trigger-inputs';
import { PipelineTrigger } from './pipeline-trigger.entity';

export interface MrActor {
  userId: string;
  userName: string;
}

const TERMINAL_JOB_STATUSES = ['success', 'failed', 'canceled', 'skipped', 'manual', 'waiting_for_resource'];
const JOB_TRACE_POLL_MS = 2000;
const MAX_VERDICT_NOTE_FINDINGS = 5;
const DIFF_FETCH_CONCURRENCY = 5;
const REVIEW_STATS_CONCURRENCY = 10;
const CACHE_MRS_TTL = 30 * 60 * 1000;

interface CachedMrData {
  updatedAt: string;
  diffs: MergeRequestDiffSchema[];
  scanFindings: DiffScanFinding[];
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
export class GitlabService implements OnModuleInit {
  private readonly logger = new Logger(GitlabService.name);
  api!: Gitlab;
  chaoticId!: string;
  updateMutex = new Mutex();
  reviewStatsMutex = new Mutex();
  mergeRequestsMutex = new Mutex();

  private readonly CACHE_KEY_MRS = 'gitlab/merge_requests';
  private readonly CACHE_KEY_REVIEW_STATS = 'gitlab/review-stats';
  private readonly mergeBotUserId: number;

  private isSeedingPipelines = false;
  private isRefreshingReviewStats = false;
  private isAutoFlaggingMrs = false;
  private isEnrichingVt = false;

  private readonly vtNotedMrIids = new Set<number>();

  private readonly mrDataCache = new Map<number, CachedMrData>();

  /** updated_at of the MR revision maintainers were last computed for. */
  private readonly maintainerCheckedAt = new Map<number, string>();

  private readonly pipelineMap = new Map<number, PipelineSchema>();
  private readonly statusMap = new Map<number, ExternalCommitStatus[]>();
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
  ) {
    this.mergeBotUserId = this.configService.getOrThrow<number>('app.mergeBotUserId');
  }

  async onModuleInit(): Promise<void> {
    await this.initApiClient().catch((err) =>
      this.logger.error(`GitLab client init failed, review features unavailable: ${errorMessage(err)}`),
    );
    void this.refreshReviewStats().catch((err) =>
      this.logger.error(`Initial review-stats refresh failed: ${errorMessage(err)}`),
    );
    void this.seedPipelines().catch((err) => this.logger.error(`Initial pipeline seed failed: ${errorMessage(err)}`));
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

  @Cron(CronExpression.EVERY_6_HOURS)
  async handleReviewStatsRefresh(): Promise<void> {
    if (this.isRefreshingReviewStats) return;
    this.isRefreshingReviewStats = true;

    try {
      await this.refreshReviewStats();
    } finally {
      this.isRefreshingReviewStats = false;
    }
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handlePipelinesRefresh(): Promise<void> {
    if (this.isSeedingPipelines) return;
    this.isSeedingPipelines = true;

    try {
      await this.seedPipelines();
    } finally {
      this.isSeedingPipelines = false;
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

      const data = openMrs.map((mr) => {
        const previousMr = previousById.get(mr.id);
        const cached = this.mrDataCache.get(mr.iid);
        if (cached !== undefined && cached.updatedAt === mr.updated_at) {
          return toMergeRequestWithDiffs(mr, cached.diffs, cached.scanFindings, previousMr);
        }
        const diffs = diffsByIid.get(mr.iid) ?? [];
        const scanFindings = this.diffScanService.scanDiffs(diffs);
        this.mrDataCache.set(mr.iid, { updatedAt: mr.updated_at, diffs, scanFindings });
        const ruleIds = [...new Set(scanFindings.map((finding) => finding.ruleId))];
        this.logger.debug(
          `MR !${mr.iid}: ${diffs.length} changed file(s), ${scanFindings.length} finding(s)` +
            (ruleIds.length > 0 ? ` [${ruleIds.join(', ')}]` : ''),
        );
        return toMergeRequestWithDiffs(mr, diffs, scanFindings, previousMr);
      });

      await this.cacheManager.set(this.CACHE_KEY_MRS, data, CACHE_MRS_TTL);

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

      await this.cacheManager.del(this.CACHE_KEY_REVIEW_STATS);

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
      const subscriptions = await this.subscriptionRepository.find();
      if (subscriptions.length === 0) {
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
      REVIEW_STATS_CONCURRENCY,
    );
  }

  async approveMergeRequest(iid: number, sha: string, actor: MrActor): Promise<void> {
    const mr = await this.api.MergeRequests.show(this.chaoticId, iid);
    const labels = toLabelStrings(mr.labels);
    if (labels.includes('malware')) {
      throw new BadRequestException(
        'This merge request is flagged as malware by the automated security scan and requires manual review.',
      );
    }
    await this.api.MergeRequestApprovals.approve(this.chaoticId, iid, { sha: mr.sha ?? sha });

    if (!labels.includes('approved')) {
      await this.api.MergeRequests.edit(this.chaoticId, iid, {
        addLabels: 'approved',
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
      await this.api.MergeRequests.edit(this.chaoticId, iid, {
        addLabels: label,
        stateEvent: label === 'dangerous' ? 'close' : undefined,
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

  /** Jobs of a pipeline, in pipeline order, for the live-log viewer. */
  async listPipelineJobs(pipelineId: number): Promise<GitlabJob[]> {
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
  }

  /**
   * Streams a job's trace over SSE. GitLab's trace is fetched as a whole, so the
   * backend polls it and forwards only the appended bytes as chunks, ending with a
   * `complete` message once the job reaches a terminal status. The teardown on
   * unsubscribe stops the polling when the client disconnects.
   */
  getJobTraceStream(pipelineId: number, jobId: number): Observable<Partial<MessageEvent<GitlabLogChunk>>> {
    const { api, chaoticId } = this;
    return new Observable((subscriber) => {
      let lastOffset = 0;
      let lastStatus: string | undefined;
      let running = true;

      const stop = (): void => {
        if (!running) return;
        running = false;
        clearInterval(timer);
        subscriber.complete();
      };

      const poll = async (): Promise<void> => {
        try {
          const job = await api.Jobs.show(chaoticId, jobId);
          lastStatus = job.status;
          const raw = await api.Jobs.showLog(chaoticId, jobId);
          if (raw.length > lastOffset) {
            subscriber.next({
              data: { offset: raw.length, text: raw.slice(lastOffset), complete: false, status: lastStatus },
            });
            lastOffset = raw.length;
          }
          if (TERMINAL_JOB_STATUSES.includes(lastStatus)) {
            subscriber.next({ data: { offset: lastOffset, text: '', complete: true, status: lastStatus } });
            stop();
          }
        } catch (error) {
          subscriber.error(error);
          stop();
        }
      };

      const timer = setInterval(() => void poll(), JOB_TRACE_POLL_MS);
      void poll();
      return () => stop();
    });
  }
}
