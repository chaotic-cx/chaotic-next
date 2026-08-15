import {
  type Build,
  BuildStatus,
  type Paginated,
  type PipelineWithExternalStatus,
  type StatsObject,
} from '@chaotic-next/shared-lib';
import { httpResource } from '@angular/common/http';
import { computed, effect, inject, Service, signal } from '@angular/core';
import { AppService } from '../app.service';

/** A pipeline as displayed: its external jobs plus the derived status label. */
export interface PipelineView {
  pipeline: PipelineWithExternalStatus['pipeline'];
  commit: PipelineWithExternalStatus['commit'];
  /** Human-readable status; failed pipelines show their failed-job count. */
  statusText: string;
}

interface QueueEntry {
  name: string;
  build_class: number | null;
}

interface ActiveQueueEntry extends QueueEntry {
  node: string;
  liveLogUrl: string;
}

/** How many pipelines are kept in the timeline lists. */
const MAX_VISIBLE_PIPELINES = 20;

@Service()
export class BuildStatusService {
  private readonly appService = inject(AppService);

  readonly lastUpdated = signal<Date | undefined>(undefined);

  private readonly packageBuildsResource = httpResource<Paginated<Build>>(() =>
    this.appService.getPackageBuildsResourceRequest(20, BuildStatus.SUCCESS),
  );
  private readonly pipelinesResource = httpResource<PipelineWithExternalStatus[]>(() =>
    this.appService.getStatusChecksResourceRequest(),
  );
  private readonly queueStatsResource = httpResource<StatsObject>(() => this.appService.getQueueStatsResourceRequest());

  readonly loadingDeployments = this.packageBuildsResource.isLoading;
  readonly loadingPipelines = this.pipelinesResource.isLoading;
  readonly loadingQueue = this.queueStatsResource.isLoading;
  readonly loading = computed(() => this.loadingDeployments() || this.loadingPipelines() || this.loadingQueue());

  readonly latestDeployments = computed<Build[]>(() => this.packageBuildsResource.value()?.items ?? []);

  readonly pipelineWithStatus = signal<PipelineView[]>([]);

  readonly activeQueue = computed<ActiveQueueEntry[]>(() =>
    (this.queueStatsResource.value()?.active.packages ?? []).map((pkg) => ({
      name: this.shortName(pkg.name),
      build_class: pkg.build_class,
      node: pkg.node,
      liveLogUrl: pkg.liveLog ?? '',
    })),
  );
  readonly waitingQueue = computed<QueueEntry[]>(() =>
    (this.queueStatsResource.value()?.waiting.packages ?? []).map((pkg) => ({
      name: this.shortName(pkg.name),
      build_class: pkg.build_class,
    })),
  );
  readonly idleQueue = computed<QueueEntry[]>(() =>
    (this.queueStatsResource.value()?.idle.nodes ?? []).map((node) => ({
      name: node.name,
      build_class: node.build_class,
    })),
  );

  constructor() {
    effect(() => {
      const pipelines = this.pipelinesResource.value();
      if (pipelines) this.transformPipelineData(pipelines);
    });
    effect(() => {
      if (this.packageBuildsResource.value() && this.pipelinesResource.value() && this.queueStatsResource.value()) {
        this.lastUpdated.set(new Date());
      }
    });
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

  refreshPipelines(): void {
    this.pipelinesResource.reload();
  }

  getQueueStats(): void {
    this.queueStatsResource.reload();
  }

  refreshQueueStats(): void {
    this.queueStatsResource.reload();
  }

  /**
   * Build the view models for the pipeline lists: shortened job names and a
   * status label that includes the failed-job count for failed pipelines.
   * @param pipelines The pipelines received via REST or SSE.
   */
  transformPipelineData(pipelines: PipelineWithExternalStatus[]): void {
    this.pipelineWithStatus.set(pipelines.slice(0, MAX_VISIBLE_PIPELINES).map((pipeline) => this.toView(pipeline)));
  }

  private toView(pipeline: PipelineWithExternalStatus): PipelineView {
    let statusText = pipeline.pipeline.status;
    if (pipeline.pipeline.status === 'failed') {
      const failedJobs = pipeline.commit.filter((job) => job.status === 'failed').length;
      statusText = `${failedJobs}/${pipeline.commit.length} failed`;
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
}
