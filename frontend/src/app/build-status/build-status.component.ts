import { BreakpointObserver } from '@angular/cdk/layout';
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Meta } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { Build } from '@chaotic-next/shared-lib';
import { MessageToastService } from '@garudalinux/core';
import { Card } from '@openng/optimus-ui/card';
import { Dialog } from '@openng/optimus-ui/dialog';
import { Panel } from '@openng/optimus-ui/panel';
import { Ripple } from '@openng/optimus-ui/ripple';
import { Skeleton } from '@openng/optimus-ui/skeleton';
import { TableModule } from '@openng/optimus-ui/table';
import { Timeline } from '@openng/optimus-ui/timeline';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { AppService } from '../app.service';
import { castTo, packageLogRouteFromUrl, range } from '../functions';
import { BuildClassPipe } from '../pipes/build-class.pipe';
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
    TableModule,
    BuildClassPipe,
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

  readonly dialogData = signal<PipelineView | null>(null);
  readonly dialogVisible = signal<boolean>(false);
  readonly isWide = signal<boolean>(true);

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
    }
  }

  readonly createRange = range;
}
