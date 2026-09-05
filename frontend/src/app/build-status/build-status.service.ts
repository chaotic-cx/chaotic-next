import { HttpClient, httpResource } from '@angular/common/http';
import { computed, DestroyRef, effect, inject, Service, signal, untracked } from '@angular/core';
import {
  type Build,
  DEFAULT_DEPLOYMENT_STATUSES,
  type Paginated,
  type PipelineWithExternalStatus,
  promoteBodySchema,
  type StatsObject,
} from '@chaotic-next/shared-lib';
import { lastValueFrom } from 'rxjs';
import { APP_CONFIG } from '../../environments/app-config.token';
import { AppService } from '../app.service';
import { resourceValue } from '../functions';
import {
  computeQueueEstimates,
  formatEta,
  overallAverageMinutes,
  type PackageBuildAverage,
  type QueueEstimates,
} from './queue-estimates';

export const BUILD_ESTIMATE_TOOLTIP = 'Estimated from historical average build times — actual times vary.';
export const BUILD_OVERTIME_TOOLTIP = 'Build exceeded its historical average by 2+ minutes — may be stuck.';

export interface PipelineView {
  pipeline: PipelineWithExternalStatus['pipeline'];
  commit: PipelineWithExternalStatus['commit'];
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
const BUILD_CLASS_UNKNOWN = 'unknown';

@Service()
export class BuildStatusService {
  private readonly appService = inject(AppService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly http = inject(HttpClient);
  private readonly backendUrl = inject(APP_CONFIG).backendUrl;

  private readonly packageBuildsResource = httpResource<Paginated<Build>>(() =>
    this.appService.getPackageBuildsResourceRequest(20, [...DEFAULT_DEPLOYMENT_STATUSES]),
  );
  private readonly pipelinesResource = httpResource<PipelineWithExternalStatus[]>(() =>
    this.appService.getStatusChecksResourceRequest(),
  );
  private readonly queueStatsResource = httpResource<StatsObject>(() => this.appService.getQueueStatsResourceRequest());
  private readonly averagesResource = httpResource<PackageAverageRow[]>(() => {
    const names = [...this.activeQueue().map((pkg) => pkg.name), ...this.waitingQueue().map((pkg) => pkg.name)];
    if (names.length === 0) return undefined;
    return this.appService.getPackageAverageBuildTimesResourceRequest(names);
  });
  private readonly builderAveragesResource = httpResource<PackageAverageRow[]>(() => {
    const names = [...this.activeQueue().map((pkg) => pkg.name), ...this.waitingQueue().map((pkg) => pkg.name)];
    const builders = [
      ...new Set([...this.activeQueue().map((pkg) => pkg.node), ...this.idleQueue().map((node) => node.name)]),
    ].filter(Boolean);
    if (names.length === 0 || builders.length === 0) return undefined;
    return this.appService.getPackageAverageBuildTimesResourceRequest(names, undefined, builders);
  });
  private readonly queueLoaded = signal(false);

  readonly initialLoaded = signal(false);
  readonly cardMinHeight = signal<number | undefined>(undefined);

  beginNavigation(): void {
    this.queueLoaded.set(false);
    this.initialLoaded.set(false);
  }

  readonly loadingDeployments = this.packageBuildsResource.isLoading;
  readonly loadingPipelines = this.pipelinesResource.isLoading;
  readonly loadingQueue = computed(() => this.queueStatsResource.isLoading() && !this.queueLoaded());
  readonly loadingAverages = computed(
    () => this.averagesResource.isLoading() || this.builderAveragesResource.isLoading(),
  );
  readonly loading = computed(
    () => this.loadingDeployments() || this.loadingPipelines() || this.loadingQueue() || this.loadingAverages(),
  );

  readonly latestDeployments = computed<Build[]>(() => resourceValue(this.packageBuildsResource)?.items ?? []);

  readonly pipelineWithStatus = signal<PipelineView[]>([]);

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

  private readonly packageAverages = computed<PackageBuildAverage[]>(() =>
    (resourceValue(this.averagesResource) ?? []).map((row) => ({
      pkgname: row.pkgname,
      averageMinutes: Number(row.average_build_time),
      samples: Number(row.samples),
    })),
  );

  private readonly packageBuilderAverages = computed<Map<string, Map<string, number>>>(() => {
    const map = new Map<string, Map<string, number>>();
    for (const row of resourceValue(this.builderAveragesResource) ?? []) {
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
    for (const row of resourceValue(this.builderAveragesResource) ?? []) {
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
    // pipelineWithStatus is fed from both this resource and live SSE 'pipeline'
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

    effect(() => {
      if (!this.queueStatsResource.isLoading()) this.queueLoaded.set(true);
    });

    effect(() => {
      if (this.queueLoaded()) void this.packageAverages();
    });

    effect(() => {
      if (!this.loading()) this.initialLoaded.set(true);
    });

    const tick = window.setInterval(() => this.now.set(Date.now()), ESTIMATE_TICK_MS);
    this.destroyRef.onDestroy(() => window.clearInterval(tick));
  }

  /** Start-time labels for running builds, e.g. `started 08:20` or `unknown start`. */
  readonly activeStartedLabels = computed<Map<string, string>>(() => {
    const labels = new Map<string, string>();
    for (const pkg of this.activeQueue()) {
      const startedMs = pkg.startedAt ?? this.pipelineStartedAt().get(pkg.name);
      if (startedMs === undefined) continue;
      const date = new Date(startedMs);
      const hh = String(date.getHours()).padStart(2, '0');
      const mm = String(date.getMinutes()).padStart(2, '0');
      labels.set(pkg.rawName, `started ${hh}:${mm}`);
    }
    return labels;
  });

  /** Remaining-time labels for running builds, e.g. `~6m left` (kept for log view). */
  readonly activeEtaLabels = computed<Map<string, string>>(() => {
    const labels = new Map<string, string>();
    for (const [pkgname, minutes] of this.estimates().activeFinish) {
      if (this.estimates().activeOvertime.has(pkgname)) continue;
      labels.set(pkgname, `${formatEta(minutes)} left`);
    }
    return labels;
  });

  /** Overtime labels for running builds that exceeded average by 2+ minutes. */
  readonly activeOvertimeLabels = computed<Map<string, string>>(() => {
    const labels = new Map<string, string>();
    for (const [pkgname, minutes] of this.estimates().activeOvertime) {
      labels.set(pkgname, `${formatEta(minutes)} overtime`);
    }
    return labels;
  });

  /** Start-time labels for queued builds keyed by pkgname, e.g. `starts in ~12m`. */
  readonly waitingStartEtaLabels = computed<Map<string, string>>(() => {
    const labels = new Map<string, string>();
    for (const [pkgname, minutes] of this.estimates().waitingStart) {
      labels.set(pkgname, `starts in ${formatEta(minutes)}`);
    }
    return labels;
  });

  readonly activeEtaTooltips = computed<Map<string, string>>(() => {
    const map = new Map<string, string>();
    for (const pkg of this.activeQueue()) {
      const base = this.activeEtaIsFallback().get(pkg.rawName) ? this.activeEtaFallbackTooltip : BUILD_ESTIMATE_TOOLTIP;
      const samples = this.samplesFor(pkg.rawName, pkg.node);
      map.set(pkg.rawName, samples !== undefined ? `${base} · ${samples} samples` : base);
    }
    return map;
  });

  readonly activeOvertimeTooltips = computed<Map<string, string>>(() => {
    const map = new Map<string, string>();
    for (const pkg of this.activeQueue()) {
      if (!this.estimates().activeOvertime.has(pkg.rawName)) continue;
      const samples = this.samplesFor(pkg.rawName, pkg.node);
      const base = BUILD_OVERTIME_TOOLTIP;
      map.set(pkg.rawName, samples !== undefined ? `${base} · ${samples} samples` : base);
    }
    return map;
  });

  readonly waitingStartTooltips = computed<Map<string, string>>(() => {
    const map = new Map<string, string>();
    for (const [pkgname] of this.estimates().waitingStart) {
      const samples = this.samplesFor(pkgname);
      const base = BUILD_ESTIMATE_TOOLTIP;
      map.set(pkgname, samples !== undefined ? `${base} · ${samples} samples` : base);
    }
    return map;
  });

  readonly queueClearLabel = computed<string | undefined>(() => {
    const minutes = this.estimates().queueClear;
    return minutes === undefined ? undefined : `Queue empty in ${formatEta(minutes)}`;
  });

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

  readonly activeEtaFallbackTooltip = 'No history for this package on this builder — average from other builders';
  readonly activeUnknownTooltip = 'No build history for this package — estimate unavailable';

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

  async promote(pkgbase: string, arch = 'x86_64', targetRepo = 'chaotic-aur'): Promise<void> {
    await lastValueFrom(
      this.http.post(
        `${this.backendUrl}/api/queue/promote`,
        promoteBodySchema.parse({ pkgbase, arch, target_repo: targetRepo }),
      ),
    );
  }

  transformPipelineData(pipelines: PipelineWithExternalStatus[]): void {
    this.pipelineWithStatus.set(pipelines.slice(0, MAX_VISIBLE_PIPELINES).map((pipeline) => this.toView(pipeline)));
  }

  applyPipelineDelta(delta: PipelineWithExternalStatus[]): void {
    if (delta.length === 0) return;
    if (delta.length >= MAX_VISIBLE_PIPELINES) {
      this.transformPipelineData(delta);
      return;
    }
    const current = this.pipelineWithStatus();
    const byId = new Map(current.map((view) => [view.pipeline.id, view]));
    for (const pipeline of delta) byId.set(pipeline.pipeline.id, this.toView(pipeline));
    const merged = [...byId.values()].sort((a, b) => b.pipeline.id - a.pipeline.id).slice(0, MAX_VISIBLE_PIPELINES);
    this.pipelineWithStatus.set(merged);
  }

  private toView(pipeline: PipelineWithExternalStatus): PipelineView {
    const failedJobs = pipeline.commit.filter((job) => job.status === 'failed').length;
    let statusText = pipeline.pipeline.status;
    if (failedJobs > 0) {
      statusText = `${failedJobs}/${pipeline.commit.length} failed`;
    } else if (pipeline.pipeline.status === 'canceled') {
      statusText = 'success';
    }
    return {
      pipeline: pipeline.pipeline,
      commit: pipeline.commit.map((job) => ({ ...job, name: job.name.split(': ')[1] ?? job.name })),
      statusText,
    };
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
