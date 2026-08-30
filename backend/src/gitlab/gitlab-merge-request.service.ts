import {
  type DiffScanFinding,
  type MergeRequestWithDiffs,
  NotificationPayload,
  totalEngines,
  type VtIndicatorReport,
} from '@chaotic-next/shared-lib';
import { type MergeRequestDiffSchema, MergeRequestSchema } from '@gitbeaker/core';
import { type Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import { BadRequestException, Inject, Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Mutex } from 'async-mutex';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MoreThan, Repository } from 'typeorm';
import { AurScanService } from '../diff-scan/aur-scan.service';
import { DiffScanService, type DiffScanVerdict, type MrAutoFlagLabel } from '../diff-scan/diff-scan.service';
import { extractIndicators } from '../diff-scan/indicators';
import { VirustotalService } from '../diff-scan/virustotal.service';
import { EventService } from '../events/event.service';
import { NotificationService } from '../notifications/notification.service';
import { cachedResult } from '../utils/cache';
import { CACHE_TTL_MS, MAX_DAYS_WINDOW } from '../utils/constants';
import {
  clampInt,
  errorMessage,
  isOnSchedulePipelineRunning,
  mapWithConcurrency,
  nDaysInPast,
  sleep,
} from '../utils/functions';
import { GitlabApiService } from './gitlab-api.service';
import { type MrActor } from './interfaces';
import { MrAction, MrActionType } from './mr-action.entity';
import { fetchPackageInfo } from './mr-package-info';

const MAX_VERDICT_NOTE_FINDINGS = 5;
const DIFF_FETCH_CONCURRENCY = 5;
const CACHE_MRS_TTL = 30 * 60 * 1000;
const REVIEW_STATS_CACHE_TTL_MS = 60_000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const DEFERRED_MERGE_MAX_AGE_DAYS = 1;
const MAX_DEFERRED_MERGE_ATTEMPTS = 5;
const MERGE_STATUS_SETTLE_TIMEOUT_MS = CACHE_TTL_MS;
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
export class GitlabMergeRequestService implements OnModuleInit, OnApplicationShutdown {
  private readonly updateMutex = new Mutex();
  private fetchInFlight?: Promise<MergeRequestWithDiffs[]>;

  private readonly CACHE_KEY_MRS = 'gitlab/merge_requests';
  private readonly CACHE_FILE_PATH = join(process.cwd(), IS_PRODUCTION ? 'backend-config' : 'tmp', 'mr_cache.json');

  private isAutoFlaggingMrs = false;
  private isEnrichingVt = false;

  private readonly vtNotedMrIids = new Set<number>();
  private readonly pendingNotificationIids = new Set<number>();
  private readonly deferredMergeFailures = new Map<number, number>();

  private readonly mrDataCache = new Map<number, CachedMrData>();
  private readonly maintainerCheckedAt = new Map<number, string>();
  private lastKnownMrs: MergeRequestWithDiffs[] = [];

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @InjectPinoLogger(GitlabMergeRequestService.name) private readonly pino: PinoLogger,
    private readonly gitlabApiService: GitlabApiService,
    private readonly diffScanService: DiffScanService,
    private readonly virustotalService: VirustotalService,
    private readonly aurScanService: AurScanService,
    private readonly eventService: EventService,
    private readonly notificationService: NotificationService,
    @InjectRepository(MrAction)
    private readonly mrActionRepository: Repository<MrAction>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.restoreDiskCache().catch((err) => this.pino.warn({ err }, 'Could not restore MR cache from disk'));
    void this.handleAutoFlagRefresh().catch((err) => this.pino.error({ err }, 'Initial MR review pre-fetch failed'));
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    this.pino.info({ signal: signal ?? 'unknown' }, 'Application shutdown signal received, saving MR cache to disk');
    await this.saveDiskCache().catch((err) =>
      this.pino.error({ err }, 'Could not persist MR cache to disk on shutdown'),
    );
  }

  private async restoreDiskCache(): Promise<void> {
    if (!existsSync(this.CACHE_FILE_PATH)) return;
    try {
      const raw = await readFile(this.CACHE_FILE_PATH, 'utf-8');
      const mrs = JSON.parse(raw) as MergeRequestWithDiffs[];
      if (Array.isArray(mrs) && mrs.length > 0) {
        await this.cacheManager.set(this.CACHE_KEY_MRS, mrs, CACHE_MRS_TTL);
        this.pino.info({ count: mrs.length, path: this.CACHE_FILE_PATH }, 'Restored MRs from disk cache');
      }
    } catch (err) {
      this.pino.warn({ err }, 'Failed to parse disk MR cache');
    }
  }

  private async saveDiskCache(): Promise<void> {
    if (this.lastKnownMrs.length === 0) return;
    try {
      await mkdir(join(process.cwd(), 'tmp'), { recursive: true });
      await writeFile(this.CACHE_FILE_PATH, JSON.stringify(this.lastKnownMrs), 'utf-8');
      this.pino.info({ count: this.lastKnownMrs.length, path: this.CACHE_FILE_PATH }, 'Persisted MRs to disk cache');
    } catch (err) {
      this.pino.error({ err }, 'Failed to write disk MR cache');
    }
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
          this.pino.warn({ mrIid: action.mergeRequestIid, blockingLabel }, 'Skipping deferred merge of MR');
          continue;
        }

        this.pino.info({ mrIid: action.mergeRequestIid }, 'Processing deferred merge after scheduled pipeline run');
        try {
          await this.mergeWithRetry(action.mergeRequestIid, openMr.sha ?? action.commitSha ?? '');
          mergedCount++;
          this.deferredMergeFailures.delete(action.mergeRequestIid);
        } catch (err) {
          this.deferredMergeFailures.set(action.mergeRequestIid, failedAttempts + 1);
          this.pino.error({ err, mrIid: action.mergeRequestIid }, 'Failed to execute deferred merge');
        }
      }

      if (mergedCount > 0) {
        await this.cacheManager.del(this.CACHE_KEY_MRS);
        void this.refreshOpenMergeRequests();
      }
    } catch (err) {
      this.pino.debug({ err }, 'Could not query database for deferred MR merges');
    }
  }

  private async abandonDeferredMerge(iid: number): Promise<void> {
    this.pino.error(
      { mrIid: iid, attempts: MAX_DEFERRED_MERGE_ATTEMPTS },
      'Deferred merge failed repeatedly, the service stops retrying it',
    );
    try {
      await this.api.MergeRequestNotes.create(
        this.chaoticId,
        iid,
        `⚠️ The automatic merge failed ${MAX_DEFERRED_MERGE_ATTEMPTS} times. A maintainer must merge this merge request manually.`,
      );
    } catch (err) {
      this.pino.warn({ err, mrIid: iid }, 'Could not mark MR as abandoned');
    }
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async handleAutoFlagRefresh(): Promise<void> {
    if (this.isAutoFlaggingMrs) {
      this.pino.debug('Auto-flag refresh already running, skipping');
      return;
    }
    this.isAutoFlaggingMrs = true;

    try {
      this.pino.debug('Starting auto-flag refresh');
      const mrs = await this.getOpenMergeRequests(true);
      await this.autoFlagMergeRequests(mrs);

      void this.enrichVirusTotalReports(mrs).catch((err) => this.pino.error({ err }, 'VirusTotal enrichment failed'));
      void this.enrichMaintainerInfo(mrs).catch((err) => this.pino.error({ err }, 'Maintainer enrichment failed'));
      void this.enrichPackageInfo(mrs).catch((err) => this.pino.error({ err }, 'Package info enrichment failed'));

      await this.flushDeferredNotifications();
    } catch (err) {
      this.pino.error({ err }, 'Auto-flag refresh failed');
    } finally {
      this.isAutoFlaggingMrs = false;
    }
  }

  async getOpenMergeRequests(overwriteCache = false): Promise<MergeRequestWithDiffs[]> {
    if (!overwriteCache) {
      const cached = await this.cacheManager.get<MergeRequestWithDiffs[]>(this.CACHE_KEY_MRS);
      if (cached) {
        this.pino.debug('Serving open MRs from cache');
        return cached;
      }
    }
    if (this.fetchInFlight) {
      this.pino.debug('Joining in-flight open MR fetch');
      return this.fetchInFlight;
    }
    this.fetchInFlight = this.fetchOpenMergeRequests().finally(() => {
      this.fetchInFlight = undefined;
    });
    return this.fetchInFlight;
  }

  private async fetchOpenMergeRequests(): Promise<MergeRequestWithDiffs[]> {
    const openMrs: MergeRequestSchema[] = await this.api.MergeRequests.all({
      state: 'opened',
      perPage: 100,
      projectId: this.chaoticId,
    });
    this.pino.info({ count: openMrs.length }, 'Fetched open MRs');

    const openIids = new Set(openMrs.map((mr) => mr.iid));
    for (const iid of this.mrDataCache.keys()) {
      if (!openIids.has(iid)) this.mrDataCache.delete(iid);
    }

    const staleMrs = openMrs.filter((mr) => {
      const cached = this.mrDataCache.get(mr.iid);
      return cached === undefined || cached.updatedAt !== mr.updated_at;
    });
    this.pino.info({ staleCount: staleMrs.length, totalCount: openMrs.length }, 'Fetching diffs for stale MRs');

    // One MR whose diff fails to load (e.g. a transient GitLab 500) must not fail
    // the whole batch: its diffs just come back empty.
    const diffsByIid = new Map<number, MergeRequestDiffSchema[]>();
    await mapWithConcurrency(
      staleMrs,
      async (mr) => {
        const diffs = await this.api.MergeRequests.allDiffs(this.chaoticId, mr.iid).catch((err: unknown) => {
          this.pino.warn({ err, mrIid: mr.iid }, 'Failed to fetch diffs for MR');
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
        const scanFindings = await this.diffScanService.scanDiffs(
          diffs,
          undefined,
          'mr-diff',
          this.aurScanService.packageDependencies.bind(this.aurScanService),
        );
        this.mrDataCache.set(mr.iid, { updatedAt: mr.updated_at, diffs, scanFindings });
        const ruleIds = [...new Set(scanFindings.map((finding) => finding.ruleId))];
        this.pino.debug(
          { mrIid: mr.iid, changedFileCount: diffs.length, findingCount: scanFindings.length, ruleIds },
          'Diff scan results',
        );
        return toMergeRequestWithDiffs(mr, diffs, scanFindings, previousMr);
      }),
    );

    this.lastKnownMrs = data;
    await this.cacheManager.set(this.CACHE_KEY_MRS, data, CACHE_MRS_TTL);

    void this.enrichPackageInfo(data).catch((err) => this.pino.error({ err }, 'Package info enrichment failed'));

    return data;
  }

  private async refreshOpenMergeRequests(): Promise<void> {
    try {
      await this.getOpenMergeRequests(true);
    } catch (err) {
      this.pino.error({ err }, 'Failed to refresh merge requests');
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

      this.pino.debug({ mrIds: [...currentIds] }, 'Current MR IDs');
      this.pino.debug({ mrIds: [...newIds] }, 'New MR IDs');
      this.pino.info({ hasNewMr }, 'Has new MR');

      await this.autoFlagMergeRequests(newData).catch((err) =>
        this.pino.error({ err }, 'Auto-flagging after MR webhook failed'),
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
          this.pino.debug({ mrIid: mr.iid }, 'Scan score below label thresholds, leaving MR unlabelled');
        }
        continue;
      }
      if (this.hasAutoFlagLabel(mr.labels, verdict.label)) {
        this.pino.debug(
          { mrIid: mr.iid, label: verdict.label, score: verdict.score },
          'Verdict label already present, skipping',
        );
        continue;
      }
      this.pino.debug({ mrIid: mr.iid, label: verdict.label, score: verdict.score }, 'Applying auto-flag verdict');

      try {
        // addLabels only appends; sending the full list would race against label
        // changes since our snapshot was taken and could wipe e.g. human-review.
        await this.api.MergeRequests.edit(this.chaoticId, mr.iid, {
          addLabels: verdict.label,
        });
        mr.labels.push(verdict.label);
        flaggedMrs.push(mr);
        changed = true;
        this.pino.warn({ mrIid: mr.iid, label: verdict.label, score: verdict.score }, 'Auto-flagged MR');
        await this.postScanVerdictComments(mr, verdict);
      } catch (err) {
        this.pino.warn({ err, mrIid: mr.iid }, 'Could not auto-flag MR');
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
        this.pino.warn({ err, mrIid: mr.iid, ruleId: finding.ruleId }, 'Could not anchor finding on MR');
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
      this.pino.debug('VirusTotal disabled (no API key), skipping enrichment');
      return;
    }
    if (this.isEnrichingVt) {
      this.pino.debug('VirusTotal enrichment already running, skipping');
      return;
    }
    this.isEnrichingVt = true;

    try {
      for (const mr of mrs) {
        if (!mr.scanFindings || mr.scanFindings.length === 0) continue;
        if (mr.vtReports !== undefined) {
          this.pino.debug({ mrIid: mr.iid }, 'VirusTotal reports already present, skipping');
          continue;
        }
        const indicators = extractIndicators(mr.diffs);
        if (indicators.length === 0) {
          this.pino.debug({ mrIid: mr.iid }, 'No indicators worth checking on VirusTotal');
          continue;
        }

        this.pino.debug({ mrIid: mr.iid, count: indicators.length }, 'Checking indicators on VirusTotal');
        const reports = await this.virustotalService.reportOn(indicators);
        mr.vtReports = reports;
        if (reports.length === 0) {
          this.pino.debug({ mrIid: mr.iid }, 'No VirusTotal reports (lookups failed or nothing known)');
          continue;
        }
        this.pino.debug(
          { mrIid: mr.iid, verdicts: reports.map((report) => `${report.type}=${report.verdict}`) },
          'VirusTotal verdicts',
        );
        await this.cacheManager.set(this.CACHE_KEY_MRS, mrs);
        this.eventService.sseEvents$.next({ data: { type: 'merge_request', mr: [mr], hasNewMr: false } });

        const notable = reports.filter((report) => report.verdict === 'malicious' || report.verdict === 'suspicious');
        if (notable.length > 0 && !this.vtNotedMrIids.has(mr.iid)) {
          this.pino.debug({ mrIid: mr.iid, notableCount: notable.length }, 'Posting VirusTotal note');
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
          this.pino.debug({ mrIid: mr.iid, pkgname }, 'Package not found in the AUR, skipping maintainer info');
          continue;
        }

        this.maintainerCheckedAt.set(mr.iid, mr.updated_at);
        mr.maintainers = status.maintainers;
        mr.maintainerChange = status.change ?? undefined;
        changedMrs.push(mr);
        changed = true;
        if (status.change) {
          this.pino.warn(
            {
              mrIid: mr.iid,
              pkgname,
              added: status.change.added,
              removed: status.change.removed,
            },
            'Maintainer change detected',
          );
        }
      }
    } catch (err) {
      this.pino.warn({ err, count: pkgnames.length }, 'Maintainer lookup failed');
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
      const info = await fetchPackageInfo(this.api, this.chaoticId, pkgname, this.pino);
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
      this.pino.debug({ mrIid: iid }, 'Posted VirusTotal note');
      return true;
    } catch (err) {
      this.pino.warn({ err, mrIid: iid }, 'Could not post VirusTotal note');
      return false;
    }
  }

  private async notifySubscribers(newMr: MergeRequestWithDiffs[]) {
    try {
      const scannable = newMr.filter((mr) => mr.diffs.length > 0);
      for (const mr of newMr) {
        if (mr.diffs.length === 0) this.pendingNotificationIids.add(mr.iid);
      }
      const deferred = newMr.length - scannable.length;
      if (deferred > 0) {
        this.pino.warn({ count: deferred }, 'Deferred notifying about new MRs: their diffs were unavailable');
      }
      if (scannable.length === 0) return;

      // MRs without a parseable "chore(update): <pkgname>" title stay silent:
      // a notification without a package name is not actionable.
      const notifyable = scannable.flatMap((mr) => {
        const pkg = mrPkgname(mr.title);
        return pkg === null ? [] : [{ mr, pkg }];
      });
      const skipped = scannable.length - notifyable.length;
      if (skipped > 0) {
        this.pino.warn({ count: skipped }, 'Skipped notifying about MRs without a parseable package name');
      }
      if (notifyable.length === 0) return;

      const summaries = notifyable
        .map(({ mr, pkg }) => {
          const findings = mr.scanFindings?.length ?? 0;
          if (findings === 0) return pkg;
          const detail = findings === 1 ? '1 finding' : `${findings} findings`;
          return `${pkg} (${detail})`;
        })
        .join(', ');
      this.pino.info({ summaries }, 'Notifying subscribers about new MRs');

      const iids = notifyable.map(({ mr }) => mr.iid).join(',');
      const targetUrl = `https://aur.chaotic.cx/update-review?newMr=${iids}`;
      const notificationPayload: NotificationPayload = {
        notification: {
          title: 'New update for review!',
          icon: '/android-chrome-512x512.png',
          body: `Updates awaiting your review: ${summaries}`,
          data: { onActionClick: { default: { operation: 'navigateLastFocusedOrOpen', url: targetUrl } } },
        },
      };

      const attempted = await this.notificationService.broadcast(notificationPayload, 'mr-review');
      if (attempted === 0) return;
      this.pino.info({ count: attempted }, 'Sent notifications to subscribers');
    } catch (error) {
      this.pino.error({ err: error }, 'Error notifying subscribers');
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
    this.pino.info({ count: ready.length }, 'Flushing deferred new-MR notifications whose diffs are available now');
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

  async approveMergeRequest(iid: number, sha: string, actor: MrActor): Promise<{ deferred: boolean }> {
    const mr = await this.api.MergeRequests.show(this.chaoticId, iid);
    const labels = toLabelStrings(mr.labels);
    if (labels.includes('malware')) {
      throw new BadRequestException(
        'This merge request is flagged as malware by the automated security scan and requires manual review.',
        { errorCode: 'MR_FLAGGED_MALWARE' },
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

    const cachedMrs = await this.cacheManager.get<MergeRequestWithDiffs[]>(this.CACHE_KEY_MRS);
    const previousMr = cachedMrs?.find((candidate) => candidate.id === mr.id);

    const deferred = isOnSchedulePipelineRunning();
    try {
      if (deferred) {
        this.pino.info(
          { mrIid: iid },
          'MR approved while scheduled pipeline is running, merge executes once it completes',
        );
      } else {
        await this.mergeWithRetry(iid, targetSha);
      }
    } finally {
      await this.cacheManager.del(this.CACHE_KEY_MRS);
      const approvedLabels = labels.includes('approved') ? labels : [...labels, 'approved'];
      this.eventService.sseEvents$.next({
        data: {
          type: 'merge_request',
          mr: [
            toMergeRequestWithDiffs(
              { ...mr, labels: approvedLabels },
              previousMr?.diffs ?? [],
              previousMr?.scanFindings ?? [],
              previousMr,
            ),
          ],
          hasNewMr: false,
        },
      });
      void this.refreshOpenMergeRequests();
    }
    return { deferred };
  }

  /**
   * Merges an MR. This method reacts to GitLab's `detailed_merge_status` instead of
   * blind retries, approves again when a push reset the approval, and leaves rebasing
   * to the server-side merge method.
   */
  private async mergeWithRetry(iid: number, sha: string): Promise<void> {
    try {
      try {
        await this.api.MergeRequests.accept(this.chaoticId, iid, { sha });
        return;
      } catch (error) {
        this.pino.warn({ err: error, mrIid: iid }, 'Initial merge failed');
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

      throw new BadRequestException(`Cannot merge MR !${iid}: ${describeMergeBlocker(mr.detailed_merge_status)}`, {
        errorCode: 'MERGE_BLOCKED',
      });
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException(`Could not merge MR !${iid}: ${errorMessage(err)}`, {
        errorCode: 'MERGE_FAILED',
      });
    }
  }

  private async reApproveAndMerge(iid: number, headSha: string): Promise<void> {
    this.pino.warn({ mrIid: iid }, 'Approval of MR was lost, the service approves it again');
    await this.api.MergeRequestApprovals.approve(this.chaoticId, iid, { sha: headSha });
    await this.api.MergeRequests.accept(this.chaoticId, iid, { sha: headSha });
  }

  private async hasNoChanges(iid: number): Promise<boolean> {
    try {
      const diffs = await this.api.MergeRequests.allDiffs(this.chaoticId, iid);
      return diffs.length === 0;
    } catch (err) {
      this.pino.warn({ err, mrIid: iid }, 'Could not fetch diffs of MR');
      return false;
    }
  }

  private async closeEmptyMergeRequest(iid: number): Promise<void> {
    this.pino.info({ mrIid: iid }, 'MR contains no changes against its target branch, the service closes it');
    try {
      await this.api.MergeRequests.edit(this.chaoticId, iid, { stateEvent: 'close' });
      await this.api.MergeRequestNotes.create(
        this.chaoticId,
        iid,
        '🔒 Closed automatically: the target branch already contains this change.',
      );
    } catch (err) {
      throw new BadRequestException(`Could not close empty MR !${iid}: ${errorMessage(err)}`, {
        errorCode: 'CLOSE_FAILED',
      });
    }
    throw new BadRequestException(`MR !${iid} contains no changes against its target branch. The service closed it.`, {
      errorCode: 'EMPTY_MR_CLOSED',
    });
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

  private get api() {
    return this.gitlabApiService.api;
  }

  private get chaoticId(): string {
    return this.gitlabApiService.chaoticId;
  }
}
