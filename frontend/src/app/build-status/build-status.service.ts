import { HttpClient, httpResource } from '@angular/common/http';
import { computed, DestroyRef, effect, inject, Service, signal, type Signal, untracked } from '@angular/core';
import {
  type Build,
  type ChaoticEvent,
  DEFAULT_DEPLOYMENT_STATUSES,
  type Paginated,
  type PipelineWithExternalStatus,
  promoteBodySchema,
  type StatsObject,
} from '@chaotic-next/shared-lib';
import { translateSignal, TranslocoService } from '@jsverse/transloco';
import { lastValueFrom } from 'rxjs';
import { APP_CONFIG } from '../../environments/app-config.token';
import { AppService } from '../app.service';
import {
  loadingWithoutValue,
  resourceFailed,
  resourceSignal,
  resourceValue,
  retainedResourceValue,
  sameItems,
} from '../functions';
import { injectActiveTranslation } from '../i18n/active-translation';
import {
  computeQueueEstimates,
  formatEta,
  OVERTIME_THRESHOLD_MINUTES,
  overallAverageMinutes,
  type PackageBuildAverage,
  type QueueEstimates,
} from './queue-estimates';

export interface PipelineView {
  pipeline: PipelineWithExternalStatus['pipeline'];
  commit: PipelineWithExternalStatus['commit'];
  // Effective GitLab status: a canceled pipeline counts as success.
  status: string;
  failedJobs: number;
  statusText: string;
}

interface QueueEntry {
  name: string;
  rawName: string;
  repo: string;
  build_class: number | string | null;
}

interface ActiveQueueEntry extends QueueEntry {
  node: string;
  liveLogUrl: string;
  startedAt?: number;
}

interface PackageAverageRow {
  pkgname: string;
  builder?: string;
  average_build_time: string;
  samples: string;
}

const MAX_VISIBLE_PIPELINES = 40;
const ESTIMATE_TICK_MS = 30_000;
const MS_PER_MINUTE = 60_000;
const BUILD_CLASS_UNKNOWN = 'unknown';

/** Loading counts only while nothing is shown yet. A reload keeps the last value on screen. */
function firstLoad(resource: { isLoading(): boolean; hasValue(): boolean; value(): unknown }): Signal<boolean> {
  return loadingWithoutValue(resource, resourceSignal(resource));
}

@Service()
export class BuildStatusService {
  private readonly appService = inject(AppService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly http = inject(HttpClient);
  private readonly backendUrl = inject(APP_CONFIG).backendUrl;
  private readonly transloco = inject(TranslocoService);

  private readonly activeTranslation = injectActiveTranslation();

  readonly estimateTooltip = translateSignal('buildStatus.estimates.tooltip');
  readonly overtimeTooltip = translateSignal('buildStatus.estimates.overtimeTooltip', {
    minutes: OVERTIME_THRESHOLD_MINUTES,
  });
  readonly activeEtaFallbackTooltip = translateSignal('buildStatus.estimates.fallbackTooltip');
  readonly activeUnknownTooltip = translateSignal('buildStatus.estimates.unknownTooltip');

  private readonly packageBuildsResource = httpResource<Paginated<Build>>(() =>
    this.appService.getPackageBuildsResourceRequest(20, [...DEFAULT_DEPLOYMENT_STATUSES]),
  );
  private readonly pipelinesResource = httpResource<PipelineWithExternalStatus[]>(() =>
    this.appService.getStatusChecksResourceRequest(),
  );
  private readonly queueStatsResource = httpResource<StatsObject>(() => this.appService.getQueueStatsResourceRequest());
  // A queue refresh creates new arrays. Comparing items keeps the averages requests stable,
  // so the estimates do not blank out while the same packages are fetched again.
  private readonly queuedPackageNames = computed(
    () => [...this.activeQueue().map((pkg) => pkg.name), ...this.waitingQueue().map((pkg) => pkg.name)],
    { equal: sameItems },
  );
  private readonly queueBuilderNames = computed(
    () =>
      [...new Set([...this.activeQueue().map((pkg) => pkg.node), ...this.idleQueue().map((node) => node.name)])].filter(
        Boolean,
      ),
    { equal: sameItems },
  );
  private readonly averagesResource = httpResource<PackageAverageRow[]>(() => {
    const names = this.queuedPackageNames();
    if (names.length === 0) return undefined;
    return this.appService.getPackageAverageBuildTimesResourceRequest(names);
  });
  private readonly builderAveragesResource = httpResource<PackageAverageRow[]>(() => {
    const names = this.queuedPackageNames();
    const builders = this.queueBuilderNames();
    if (names.length === 0 || builders.length === 0) return undefined;
    return this.appService.getPackageAverageBuildTimesResourceRequest(names, undefined, builders);
  });

  readonly loadingDeployments = firstLoad(this.packageBuildsResource);
  readonly loadingPipelines = firstLoad(this.pipelinesResource);
  readonly loadingQueue = firstLoad(this.queueStatsResource);

  readonly queueFailed = resourceFailed(this.queueStatsResource);
  readonly deploymentsFailed = resourceFailed(this.packageBuildsResource);
  readonly pipelinesFailed = resourceFailed(this.pipelinesResource);

  // False while the queue loads or after it failed, so counts show a dash instead of a false zero.
  readonly queueCountKnown = computed(() => !this.loadingQueue() && !this.queueFailed());

  /** One sentence for screen readers, announced politely whenever the counts change. */
  readonly liveSummary = computed(() => {
    this.activeTranslation();

    if (this.loadingQueue()) return '';

    if (this.queueFailed()) {
      return this.transloco.translate('buildStatus.liveSummary.unavailable');
    }

    return this.transloco.translate('buildStatus.liveSummary.text', {
      running: this.runningBuildsText(this.activeQueue().length),
      waiting: this.waitingQueue().length,
      idle: this.idleBuildersText(this.idleQueue().length),
    });
  });

  readonly latestDeployments = computed<Build[]>(() => resourceValue(this.packageBuildsResource)?.items ?? []);

  private readonly pipelineData = signal<PipelineWithExternalStatus[]>([]);

  readonly pipelineWithStatus = computed<PipelineView[]>(() => {
    this.activeTranslation();

    return this.pipelineData().map((pipeline) => this.toView(pipeline));
  });

  readonly activeQueue = computed<ActiveQueueEntry[]>(() =>
    (resourceValue(this.queueStatsResource)?.active.packages ?? []).map((pkg) => ({
      name: this.shortName(pkg.name),
      rawName: pkg.name,
      repo: this.extractRepo(pkg.name),
      build_class: this.buildClassOf(pkg.build_class, pkg.node),
      node: pkg.node,
      liveLogUrl: pkg.liveLog ?? '',
      startedAt: (pkg as { started_at?: number | null }).started_at ?? undefined,
    })),
  );

  readonly waitingQueue = computed<QueueEntry[]>(() =>
    (resourceValue(this.queueStatsResource)?.waiting.packages ?? []).map((pkg) => ({
      name: this.shortName(pkg.name),
      rawName: pkg.name,
      repo: this.extractRepo(pkg.name),
      build_class: pkg.build_class,
    })),
  );
  readonly idleQueue = computed<QueueEntry[]>(() =>
    (resourceValue(this.queueStatsResource)?.idle.nodes ?? []).map((node) => ({
      name: node.name,
      rawName: node.name,
      repo: this.extractRepo(node.name),
      build_class: this.buildClassOf(node.build_class, node.name),
    })),
  );

  private readonly averagesValue = retainedResourceValue(this.averagesResource);
  private readonly builderAveragesValue = retainedResourceValue(this.builderAveragesResource);

  private readonly packageAverages = computed<PackageBuildAverage[]>(() =>
    (this.averagesValue() ?? []).map((row) => ({
      pkgname: row.pkgname,
      averageMinutes: Number(row.average_build_time),
      samples: Number(row.samples),
    })),
  );

  private readonly packageBuilderAverages = computed<Map<string, Map<string, number>>>(() => {
    const map = new Map<string, Map<string, number>>();
    for (const row of this.builderAveragesValue() ?? []) {
      if (!row.builder) continue;
      let inner = map.get(row.pkgname);
      if (!inner) {
        inner = new Map<string, number>();
        map.set(row.pkgname, inner);
      }
      inner.set(row.builder, Number(row.average_build_time));
    }
    return map;
  });

  private readonly packageBuilderSamples = computed<Map<string, Map<string, number>>>(() => {
    const map = new Map<string, Map<string, number>>();
    for (const row of this.builderAveragesValue() ?? []) {
      if (!row.builder) continue;
      let inner = map.get(row.pkgname);
      if (!inner) {
        inner = new Map<string, number>();
        map.set(row.pkgname, inner);
      }
      inner.set(row.builder, Number(row.samples));
    }
    return map;
  });

  private readonly averageLookup = computed(() => {
    const entries = this.packageAverages();
    return {
      byName: new Map(entries.map((entry) => [entry.pkgname, entry.averageMinutes])),
      byNameSamples: new Map(entries.map((entry) => [entry.pkgname, entry.samples])),
      byBuilder: this.packageBuilderAverages(),
      byBuilderSamples: this.packageBuilderSamples(),
      overall: overallAverageMinutes(entries),
      overallSamples: entries.reduce((sum, e) => sum + e.samples, 0),
    };
  });

  private readonly now = signal(Date.now());

  /** First time each package was seen in the active queue. */
  private readonly activeFirstSeen = signal<ReadonlyMap<string, number>>(new Map());

  /** Wall-clock start time of each running build, keyed by rawName. */
  readonly activeStartedMs = computed<ReadonlyMap<string, number>>(() => {
    const firstSeen = this.activeFirstSeen();
    const now = Date.now();
    return new Map(this.activeQueue().map((pkg) => [pkg.rawName, firstSeen.get(pkg.rawName) ?? now]));
  });

  private readonly pipelineStartedAt = computed<Map<string, number>>(() => {
    const map = new Map<string, number>();
    for (const view of this.pipelineWithStatus()) {
      for (const job of view.commit) {
        if (job.status !== 'running' || !job.started_at) continue;
        const ms = Date.parse(job.started_at);
        if (Number.isNaN(ms)) continue;
        const short = job.name; // already short after toView()
        if (!map.has(short)) map.set(short, ms);
      }
    }
    return map;
  });

  readonly estimates = computed<QueueEstimates>(() => {
    const active = this.activeQueue().map((pkg) => ({
      rawName: pkg.rawName,
      startedMs:
        pkg.startedAt ??
        this.pipelineStartedAt().get(pkg.name) ??
        this.activeFirstSeen().get(pkg.rawName) ??
        Date.now(),
      buildClass: pkg.build_class,
      builderName: pkg.node,
    }));
    return computeQueueEstimates({
      active,
      waiting: this.waitingQueue().map((pkg) => ({ rawName: pkg.rawName, buildClass: pkg.build_class })),
      idle: this.idleQueue().map((node) => ({ buildClass: node.build_class, builderName: node.name })),
      nowMs: this.now(),
      avgOf: (rawName, builderName) => this.averageMinutes(rawName, builderName),
    });
  });

  constructor() {
    // pipelineData is fed from both this resource and live SSE 'pipeline'
    // events (see BuildStatusComponent), so it cannot be a pure computed; the
    // effect only seeds it from the resource while events mutate it.
    effect(() => {
      const pipelines = resourceValue(this.pipelinesResource);
      if (pipelines) this.transformPipelineData(pipelines);
    });
    // activeFirstSeen records the first wall-clock appearance of each build and
    // must persist across queue changes, so it is not pure-derivable. This
    // effect writes only its own target signal (untracked), avoiding a loop.
    effect(() => this.trackFirstSeenActive());

    const tick = window.setInterval(() => this.now.set(Date.now()), ESTIMATE_TICK_MS);
    this.destroyRef.onDestroy(() => window.clearInterval(tick));
  }

  /** Start-time labels for running builds, e.g. `started 08:20` or `unknown start`. */
  readonly activeStartedLabels = computed<Map<string, string>>(() => {
    this.activeTranslation();

    const labels = new Map<string, string>();
    for (const pkg of this.activeQueue()) {
      const startedMs = pkg.startedAt ?? this.pipelineStartedAt().get(pkg.name);
      if (startedMs === undefined) continue;
      const date = new Date(startedMs);
      const hh = String(date.getHours()).padStart(2, '0');
      const mm = String(date.getMinutes()).padStart(2, '0');
      labels.set(pkg.rawName, this.transloco.translate('buildStatus.active.startedAt', { time: `${hh}:${mm}` }));
    }
    return labels;
  });

  /** Remaining-time labels for running builds, e.g. `~6m left` (kept for log view). */
  readonly activeEtaLabels = computed<Map<string, string>>(() => {
    this.activeTranslation();

    const labels = new Map<string, string>();
    for (const [pkgname, minutes] of this.estimates().activeFinish) {
      if (this.estimates().activeOvertime.has(pkgname)) continue;

      labels.set(pkgname, this.transloco.translate('buildStatus.active.timeLeft', { eta: formatEta(minutes) }));
    }
    return labels;
  });

  /** Overtime labels for running builds that exceeded average by 2+ minutes. */
  readonly activeOvertimeLabels = computed<Map<string, string>>(() => {
    this.activeTranslation();

    const labels = new Map<string, string>();
    const isFallback = this.activeEtaIsFallback();
    const isUnknown = this.activeIsUnknown();

    for (const [pkgname, minutes] of this.estimates().activeOvertime) {
      if (isFallback.get(pkgname) || isUnknown.get(pkgname)) continue;
      labels.set(pkgname, this.transloco.translate('buildStatus.active.overtime', { eta: formatEta(minutes) }));
    }
    return labels;
  });

  /** Start-time labels for queued builds keyed by pkgname, e.g. `starts in ~12m`. */
  readonly waitingStartEtaLabels = computed<Map<string, string>>(() => {
    this.activeTranslation();

    const labels = new Map<string, string>();
    for (const [pkgname, minutes] of this.estimates().waitingStart) {
      labels.set(pkgname, this.transloco.translate('buildStatus.waiting.startsIn', { eta: formatEta(minutes) }));
    }
    return labels;
  });

  readonly activeEtaTooltips = computed<Map<string, string>>(() => {
    const map = new Map<string, string>();
    for (const pkg of this.activeQueue()) {
      const base = this.activeEtaIsFallback().get(pkg.rawName)
        ? this.activeEtaFallbackTooltip()
        : this.estimateTooltip();
      map.set(pkg.rawName, this.withSamples(base, this.samplesFor(pkg.rawName, pkg.node)));
    }
    return map;
  });

  readonly activeOvertimeTooltips = computed<Map<string, string>>(() => {
    const map = new Map<string, string>();
    for (const pkg of this.activeQueue()) {
      if (!this.estimates().activeOvertime.has(pkg.rawName)) continue;
      map.set(pkg.rawName, this.withSamples(this.overtimeTooltip(), this.samplesFor(pkg.rawName, pkg.node)));
    }
    return map;
  });

  readonly waitingStartTooltips = computed<Map<string, string>>(() => {
    const map = new Map<string, string>();
    for (const [pkgname] of this.estimates().waitingStart) {
      map.set(pkgname, this.withSamples(this.estimateTooltip(), this.samplesFor(pkgname)));
    }
    return map;
  });

  /** Share of the estimated build time already elapsed, 0–1. Overtime builds report 1. */
  readonly activeProgress = computed<Map<string, number>>(() => {
    const progress = new Map<string, number>();
    const estimates = this.estimates();
    const nowMs = this.now();
    for (const pkg of this.activeQueue()) {
      if (estimates.activeOvertime.has(pkg.rawName)) {
        progress.set(pkg.rawName, 1);
        continue;
      }
      const startedMs = estimates.activeStartedAt.get(pkg.rawName);
      const remainingMinutes = estimates.activeFinish.get(pkg.rawName);
      if (startedMs === undefined || remainingMinutes === undefined) continue;
      const elapsedMinutes = Math.max(0, (nowMs - startedMs) / MS_PER_MINUTE);
      const totalMinutes = elapsedMinutes + remainingMinutes;
      progress.set(pkg.rawName, totalMinutes > 0 ? Math.min(1, elapsedMinutes / totalMinutes) : 1);
    }
    return progress;
  });

  readonly queueClearEta = computed<string | undefined>(() => {
    const minutes = this.estimates().queueClear;
    return minutes === undefined ? undefined : formatEta(minutes);
  });

  private withSamples(tooltip: string, samples: number | undefined): string {
    if (samples === undefined) return tooltip;

    return this.transloco.translate('buildStatus.estimates.withSamples', { tooltip, samples });
  }

  private runningBuildsText(count: number): string {
    if (count === 1) {
      return this.transloco.translate('buildStatus.liveSummary.buildsRunningOne', { count });
    }

    return this.transloco.translate('buildStatus.liveSummary.buildsRunningOther', { count });
  }

  private idleBuildersText(count: number): string {
    if (count === 1) {
      return this.transloco.translate('buildStatus.liveSummary.buildersOne', { count });
    }

    return this.transloco.translate('buildStatus.liveSummary.buildersOther', { count });
  }

  private averageMinutes(rawName: string, builderName?: string): number | undefined {
    const lookup = this.averageLookup();
    const short = this.shortName(rawName);
    if (builderName) {
      const perBuilder = lookup.byBuilder.get(short)?.get(builderName);
      if (perBuilder !== undefined) return perBuilder;
    }
    return lookup.byName.get(short) ?? lookup.overall;
  }

  private samplesFor(rawName: string, builderName?: string): number | undefined {
    const lookup = this.averageLookup();
    const short = this.shortName(rawName);
    if (builderName) {
      const perBuilder = lookup.byBuilderSamples.get(short)?.get(builderName);
      if (perBuilder !== undefined) return perBuilder;
    }
    const perPkg = lookup.byNameSamples.get(short);
    if (perPkg !== undefined) return perPkg;
    return lookup.overallSamples > 0 ? lookup.overallSamples : undefined;
  }

  /** True when the active build has no history on its current node and falls back to another builder. */
  readonly activeEtaIsFallback = computed<Map<string, boolean>>(() => {
    const map = new Map<string, boolean>();
    const lookup = this.averageLookup();
    for (const pkg of this.activeQueue()) {
      const short = this.shortName(pkg.rawName);
      const hasBuilder = lookup.byBuilder.get(short)?.has(pkg.node) ?? false;
      const hasPkg = lookup.byName.has(short);
      map.set(pkg.rawName, !hasBuilder && hasPkg);
    }
    return map;
  });

  readonly activeIsUnknown = computed<Map<string, boolean>>(() => {
    const map = new Map<string, boolean>();
    const lookup = this.averageLookup();
    for (const pkg of this.activeQueue()) {
      const short = this.shortName(pkg.rawName);
      const hasBuilder = lookup.byBuilder.get(short)?.has(pkg.node) ?? false;
      const hasPkg = lookup.byName.has(short);
      map.set(pkg.rawName, !hasBuilder && !hasPkg && lookup.overall !== undefined);
    }
    return map;
  });

  private trackFirstSeenActive(): void {
    const active = this.activeQueue();
    // Own write target: untracked so the effect only reruns on queue changes.
    const previous = untracked(() => this.activeFirstSeen());
    let changed = false;
    const next = new Map<string, number>();
    const nowMs = Date.now();
    for (const pkg of active) {
      const seen = previous.get(pkg.rawName);
      if (seen === undefined) changed = true;
      next.set(pkg.rawName, seen ?? nowMs);
    }
    if (changed || previous.size !== next.size) this.activeFirstSeen.set(next);
  }

  getPackageBuilds(): void {
    this.packageBuildsResource.reload();
  }

  refreshPackageBuilds(): void {
    this.packageBuildsResource.reload();
  }

  getPipelines(): void {
    this.pipelinesResource.reload();
  }

  getQueueStats(): void {
    this.queueStatsResource.reload();
  }

  refreshQueueStats(): void {
    this.queueStatsResource.reload();
  }

  applyQueueEvent(event: ChaoticEvent): void {
    const refreshesBuilds = event.type === 'build' || event.type === 'queue_promoted';
    const refreshesQueue = refreshesBuilds || event.type === 'queue';
    if (refreshesBuilds) this.refreshPackageBuilds();
    if (refreshesQueue) this.refreshQueueStats();
  }

  async promote(pkgbase: string, arch = 'x86_64', targetRepo = 'chaotic-aur'): Promise<void> {
    await lastValueFrom(
      this.http.post(
        `${this.backendUrl}/api/queue/promote`,
        promoteBodySchema.parse({ pkgbase, arch, target_repo: targetRepo }),
      ),
    );
  }

  transformPipelineData(pipelines: PipelineWithExternalStatus[]): void {
    this.pipelineData.set(pipelines.slice(0, MAX_VISIBLE_PIPELINES));
  }

  applyPipelineDelta(delta: PipelineWithExternalStatus[]): void {
    if (delta.length === 0) return;
    if (delta.length >= MAX_VISIBLE_PIPELINES) {
      this.transformPipelineData(delta);
      return;
    }
    const current = this.pipelineData();
    const byId = new Map(current.map((pipeline) => [pipeline.pipeline.id, pipeline]));
    for (const pipeline of delta) byId.set(pipeline.pipeline.id, pipeline);
    const merged = [...byId.values()].sort((a, b) => b.pipeline.id - a.pipeline.id).slice(0, MAX_VISIBLE_PIPELINES);
    this.pipelineData.set(merged);
  }

  private toView(pipeline: PipelineWithExternalStatus): PipelineView {
    const failedJobs = pipeline.commit.filter((job) => job.status === 'failed').length;
    const status = pipeline.pipeline.status === 'canceled' ? 'success' : pipeline.pipeline.status;

    return {
      pipeline: pipeline.pipeline,
      commit: pipeline.commit.map((job) => ({ ...job, name: job.name.split(': ')[1] ?? job.name })),
      status,
      failedJobs,
      statusText: this.pipelineStatusText(status, failedJobs, pipeline.commit.length),
    };
  }

  private pipelineStatusText(status: string, failedJobs: number, totalJobs: number): string {
    if (failedJobs === 0) return status;

    return this.transloco.translate('buildStatus.pipelines.partialSuccess', {
      successful: totalJobs - failedJobs,
      total: totalJobs,
    });
  }

  private shortName(name: string): string {
    const parts = name.split('/');
    return parts.length > 2 ? parts[2] : name;
  }

  private buildClassOf(value: number | string | null, nodeName: string): number | string {
    return value === null || value === '' || value === BUILD_CLASS_UNKNOWN ? nodeName : value;
  }

  private extractRepo(name: string): string {
    const parts = name.split('/');
    return parts.length > 1 ? parts[0] : '';
  }
}
