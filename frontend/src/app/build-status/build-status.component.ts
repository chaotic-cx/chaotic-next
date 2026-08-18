import { BreakpointObserver } from '@angular/cdk/layout';
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, computed, effect, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Build } from '@chaotic-next/shared-lib';
import { MessageToastService } from '@garudalinux/core';
import { Card } from '@openng/optimus-ui/card';
import { Dialog } from '@openng/optimus-ui/dialog';
import { Panel } from '@openng/optimus-ui/panel';
import { Ripple } from '@openng/optimus-ui/ripple';
import { Skeleton } from '@openng/optimus-ui/skeleton';
import { Timeline } from '@openng/optimus-ui/timeline';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { AppService } from '../app.service';
import { castTo, packageLogRouteFromUrl, range } from '../functions';
import { BuildClassPipe } from '../pipes/build-class.pipe';
import { RelativeTimePipe } from '../pipes/relative-time.pipe';
import { TitleComponent } from '../title/title.component';
import { BuildStatusService, PipelineView } from './build-status.service';
import { PipelineTimelineComponent } from './pipeline-timeline.component';

@Component({
  selector: 'chaotic-build-status',
  imports: [
    CommonModule,
    RouterLink,
    Timeline,
    Card,
    BuildClassPipe,
    RelativeTimePipe,
    TitleComponent,
    Dialog,
    Tooltip,
    Skeleton,
    Ripple,
    Panel,
    PipelineTimelineComponent,
  ],
  templateUrl: './build-status.component.html',
  styleUrl: './build-status.component.css',
  providers: [MessageToastService],
})
export class BuildStatusComponent implements OnInit {
  appService = inject(AppService);
  buildStatusService = inject(BuildStatusService);
  cdr = inject(ChangeDetectorRef);
  messageToastService = inject(MessageToastService);
  meta = inject(Meta);
  observer = inject(BreakpointObserver);
  router = inject(Router);
  route = inject(ActivatedRoute);

  readonly dialogData = signal<PipelineView | null>(null);
  readonly dialogVisible = signal<boolean>(false);
  readonly isWide = signal<boolean>(true);
  readonly estimateTooltip = 'Estimated from historical average build times — actual times vary.';

  private static readonly WAITING_PAGE_SIZE = 15;
  private readonly waitingQueuePage = signal(1);

  /** Number of pages the waiting queue spans; at least one so the controls are stable. */
  readonly waitingQueuePageCount = computed(() =>
    Math.max(1, Math.ceil(this.buildStatusService.waitingQueue().length / BuildStatusComponent.WAITING_PAGE_SIZE)),
  );

  /** Current page clamped to the valid range after the queue shrinks or grows. */
  readonly paginatedWaitingQueuePage = computed(() => Math.min(this.waitingQueuePage(), this.waitingQueuePageCount()));

  /** Slice of the waiting queue shown on the current page. */
  readonly paginatedWaitingQueue = computed(() => {
    const queue = this.buildStatusService.waitingQueue();
    const start = (this.paginatedWaitingQueuePage() - 1) * BuildStatusComponent.WAITING_PAGE_SIZE;
    return queue.slice(start, start + BuildStatusComponent.WAITING_PAGE_SIZE);
  });

  selectWaitingQueuePage(page: number): void {
    this.waitingQueuePage.set(Math.min(Math.max(1, page), this.waitingQueuePageCount()));
  }

  constructor() {
    this.appService.chaoticEvent.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event.type === 'build') {
        void this.buildStatusService.refreshPackageBuilds();
        void this.buildStatusService.refreshQueueStats();
      }
      if (event.type === 'pipeline') {
        this.buildStatusService.transformPipelineData(event.pipeline);
        if (this.dialogVisible()) {
          this.refreshDialogData();
        }
      }
      if (event.type === 'queue') void this.buildStatusService.refreshQueueStats();
    });

    effect(() => {
      const param = this.route.snapshot.queryParamMap.get('pipeline');
      if (param === null) return;
      const id = Number(param);
      if (!Number.isInteger(id)) return;
      const pipeline = this.buildStatusService.pipelineWithStatus().find((p) => p.pipeline.id === id);
      if (pipeline && !this.dialogVisible()) {
        this.dialogData.set(pipeline);
        this.dialogVisible.set(true);
      }
    });

    effect(() => {
      if (this.dialogVisible()) return;
      if (this.route.snapshot.queryParamMap.has('pipeline')) {
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { pipeline: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
          info: { disableViewTransition: true },
        });
      }
    });

    this.observer
      .observe(`(max-width: 1100px)`)
      .pipe(takeUntilDestroyed())
      .subscribe((state) => {
        this.isWide.set(!state.matches);
        this.cdr.markForCheck();
      });
  }

  ngOnInit() {
    this.appService.updateSeoTags(this.meta, {
      title: 'Build status',
      description: 'Current build status and queue information for Chaotic-AUR',
      keywords:
        'Chaotic-AUR, Repository, Packages, Archlinux, AUR, Arch User Repository, Chaotic, Chaotic-AUR packages, Chaotic-AUR repository, Chaotic-AUR build status',
      url: this.router.url,
    });

    void this.updateAll();
  }

  updateAll(): void {
    this.buildStatusService.getQueueStats();
    this.buildStatusService.getPipelines();
    this.buildStatusService.getPackageBuilds();

    if (this.dialogVisible()) {
      this.refreshDialogData();
    }
  }

  private refreshDialogData(): void {
    const current = this.dialogData()?.pipeline.id;
    if (current === undefined) return;
    const updated = this.buildStatusService.pipelineWithStatus()?.find((pipeline) => pipeline.pipeline.id === current);
    if (updated) {
      this.dialogData.set(updated);
    }
  }

  readonly typedDeployment = castTo<Build>;

  readonly packageLogRouteFromUrl = packageLogRouteFromUrl;

  showDialog(pipelineId: number) {
    const pipeline = this.buildStatusService.pipelineWithStatus().find((p) => p.pipeline.id === pipelineId);
    if (pipeline) {
      this.dialogData.set(pipeline);
      this.dialogVisible.set(true);
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { pipeline: String(pipelineId) },
        queryParamsHandling: 'merge',
        info: { disableViewTransition: true },
      });
    }
  }

  readonly createRange = range;

  private static readonly JOB_STATUS: Record<string, { icon: string; color: string; chip: string; rank: number }> = {
    running: { icon: 'pi-spin pi-spinner', color: 'text-ctp-peach', chip: 'border-ctp-peach', rank: 0 },
    pending: { icon: 'pi-clock', color: 'text-ctp-yellow', chip: 'border-ctp-yellow', rank: 1 },
    waiting_for_resource: { icon: 'pi-hourglass', color: 'text-ctp-lavender', chip: 'border-ctp-lavender', rank: 1 },
    failed: { icon: 'pi-times-circle', color: 'text-ctp-red', chip: 'border-ctp-red', rank: 2 },
    canceled: { icon: 'pi-ban', color: 'text-ctp-subtext0', chip: 'border-ctp-subtext0', rank: 2 },
    success: { icon: 'pi-check-circle', color: 'text-ctp-green', chip: 'border-ctp-green', rank: 3 },
  };

  jobStatus(status: string): { icon: string; color: string; chip: string; rank: number } {
    return (
      BuildStatusComponent.JOB_STATUS[status] ?? {
        icon: 'pi-question-circle',
        color: 'text-ctp-subtext0',
        chip: 'border-ctp-subtext0',
        rank: 3,
      }
    );
  }

  /** Jobs ordered by lifecycle: in progress, waiting, failed/canceled, then done. */
  readonly sortedCommit = computed(() => {
    const jobs = this.dialogData()?.commit ?? [];
    return [...jobs].sort((a, b) => this.jobStatus(a.status).rank - this.jobStatus(b.status).rank);
  });
}
