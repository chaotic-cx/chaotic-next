import { Build, PipelineWithExternalStatus } from '@./shared-lib';
import { BreakpointObserver } from '@angular/cdk/layout';
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Meta } from '@angular/platform-browser';
import { Router } from '@angular/router';
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
import { BuildClassPipe } from '../pipes/build-class.pipe';
import { TitleComponent } from '../title/title.component';
import { BuildStatusService } from './build-status.service';
import { PipelineTimelineComponent } from './pipeline-timeline.component';

@Component({
  selector: 'chaotic-build-status',
  imports: [
    CommonModule,
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

  readonly dialogData = signal<PipelineWithExternalStatus>({
    pipeline: {},
    commit: [],
  } as unknown as PipelineWithExternalStatus); // Workaround for silencing Angular warning
  readonly currentTab = signal<string>('0');
  readonly dialogVisible = signal<boolean>(false);
  readonly isWide = signal<boolean>(true);

  constructor() {
    this.appService.chaoticEvent.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event.type === 'build') {
        void this.buildStatusService.getPackageBuilds(true);
        void this.buildStatusService.getQueueStats(true);
      }
      if (event.type === 'pipeline') this.buildStatusService.transformPipelineData(event.pipeline);
      if (event.type === 'queue') void this.buildStatusService.getQueueStats(true);
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
    this.appService.updateSeoTags(
      this.meta,
      'Build status',
      'Current build status and queue information for Chaotic-AUR',
      'Chaotic-AUR, Repository, Packages, Archlinux, AUR, Arch User Repository, Chaotic, Chaotic-AUR packages, Chaotic-AUR repository, Chaotic-AUR build status',
      this.router.url,
    );

    void this.updateAll(false);
  }

  /**
   * Update all the data on the page and set the last updated time
   */
  async updateAll(inBackground = false): Promise<void> {
    void this.buildStatusService.updateMutex.runExclusive(async () => {
      await Promise.all([
        this.buildStatusService.getQueueStats(inBackground),
        this.buildStatusService.getPipelines(inBackground),
        this.buildStatusService.getPackageBuilds(inBackground),
      ]);

      if (this.dialogVisible()) {
        this.dialogData.set(
          this.buildStatusService
            .pipelineWithStatus()!
            .find((pipeline) => pipeline.pipeline.id === this.dialogData().pipeline.id) as PipelineWithExternalStatus,
        );
      }

      this.buildStatusService.lastUpdated.set(new Date());
      this.cdr.markForCheck();
    });
  }

  changeTab($event: string | number | undefined): void {
    console.log($event);
  }

  typedDeployment(untypedDeployment: Build) {
    return untypedDeployment;
  }

  showDialog(pipelineId: number) {
    this.dialogData.set(
      this.buildStatusService
        .pipelineWithStatus()!
        .find((pipeline) => pipeline.pipeline.id === pipelineId) as PipelineWithExternalStatus,
    );
    this.dialogVisible.set(true);
  }

  createRange(number: number): number[] {
    return new Array(number).fill(0).map((n, index) => index + 1);
  }
}
