import { HttpClient, httpResource } from '@angular/common/http';
import { computed, DestroyRef, effect, inject, Service, signal, untracked } from '@angular/core';
import {
  type Build,
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
}

interface PackageAverageRow {
  pkgname: string;
  average_build_time: string;
  samples: string;
}

const MAX_VISIBLE_PIPELINES = 40;
const ESTIMATE_TICK_MS = 30_000;

@Service()
export class BuildStatusService {
  private readonly appService = inject(AppService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly http = inject(HttpClient);
  private readonly backendUrl = inject(APP_CONFIG).backendUrl;

  private readonly packageBuildsResource = httpResource<Paginated<Build>>(() =>
    this.appService.getPackageBuildsResourceRequest(20),
  );
  private readonly pipelinesResource = httpResource<PipelineWithExternalStatus[]>(() =>
    this.appService.getStatusChecksResourceRequest(),
  );
  private readonly queueStatsResource = httpResource<StatsObject>(() => this.appService.getQueueStatsResourceRequest());
  private readonly averagesResource = httpResource<PackageAverageRow[]>(() => {
    const names = [...this.activeQueue().map((pkg) => pkg.name), ...this.waitingQueue().map((pkg) => pkg.name)];
    return this.appService.getPackageAverageBuildTimesResourceRequest(names);
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
  readonly loadingAverages = this.averagesResource.isLoading;
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
      build_class: pkg.build_class ?? pkg.node,
      node: pkg.node,
      liveLogUrl: pkg.liveLog ?? '',
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
      build_class: node.build_class ?? node.name,
    })),
  );

  private readonly packageAverages = computed<PackageBuildAverage[]>(() =>
    (resourceValue(this.averagesResource) ?? []).map((row) => ({
      pkgname: row.pkgname,
      averageMinutes: Number(row.average_build_time),
      samples: Number(row.samples),
    })),
  );

  private readonly averageLookup = computed(() => {
    const entries = this.packageAverages();
    return {
      byName: new Map(entries.map((entry) => [entry.pkgname, entry.averageMinutes])),
      overall: overallAverageMinutes(entries),
    };
  });

  private readonly now = signal(Date.now());

  /** First time each package was seen in the active queue; builds already
   * running when the page loaded count from load time, so their remaining
   * time is never underestimated. */
  private readonly activeFirstSeen = signal<ReadonlyMap<string, number>>(new Map());

  /** Wall-clock start time of each running build, keyed by rawName. */
  readonly activeStartedMs = computed<ReadonlyMap<string, number>>(() => {
    const firstSeen = this.activeFirstSeen();
    const now = Date.now();
    return new Map(this.activeQueue().map((pkg) => [pkg.rawName, firstSeen.get(pkg.rawName) ?? now]));
  });

  readonly estimates = computed<QueueEstimates>(() =>
    computeQueueEstimates({
      active: this.activeQueue().map((pkg) => ({
        rawName: pkg.rawName,
        startedMs: this.activeFirstSeen().get(pkg.rawName) ?? Date.now(),
        buildClass: pkg.build_class,
      })),
      waiting: this.waitingQueue().map((pkg) => ({ rawName: pkg.rawName, buildClass: pkg.build_class })),
      idle: this.idleQueue().map((node) => ({ buildClass: node.build_class })),
      nowMs: this.now(),
      avgOf: (rawName) => this.averageMinutes(rawName),
    }),
  );

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

  /** Remaining-time labels for running builds keyed by pkgname, e.g. `~6m left`. */
  readonly activeEtaLabels = computed<Map<string, string>>(() => {
    const labels = new Map<string, string>();
    for (const [pkgname, minutes] of this.estimates().activeFinish) {
      labels.set(pkgname, `${formatEta(minutes)} left`);
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

  readonly queueClearLabel = computed<string | undefined>(() => {
    const minutes = this.estimates().queueClear;
    return minutes === undefined ? undefined : `Queue empty in ${formatEta(minutes)}`;
  });

  private averageMinutes(rawName: string): number | undefined {
    const lookup = this.averageLookup();
    return lookup.byName.get(this.shortName(rawName)) ?? lookup.overall;
  }

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

  private extractRepo(name: string): string {
    const parts = name.split('/');
    return parts.length > 1 ? parts[0] : '';
  }
}
