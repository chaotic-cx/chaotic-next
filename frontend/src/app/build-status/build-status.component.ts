import { Build, PipelineWithExternalStatus } from '@./shared-lib';
import { BreakpointObserver } from '@angular/cdk/layout';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit, signal } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { MessageToastService } from '@garudalinux/core';
import { Card } from 'primeng/card';
import { Dialog } from 'primeng/dialog';
import { Ripple } from 'primeng/ripple';
import { Skeleton } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { Timeline } from 'primeng/timeline';
import { Tooltip } from 'primeng/tooltip';
import { AppService } from '../app.service';
import { BuildClassPipe } from '../pipes/build-class.pipe';
import { TitleComponent } from '../title/title.component';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BuildStatusService } from './build-status.service';
import { Panel } from 'primeng/panel';

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
  ],
  templateUrl: './build-status.component.html',
  styleUrl: './build-status.component.css',
  providers: [MessageToastService],
  changeDetection: ChangeDetectionStrategy.OnPush,
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
      if (event.type === 'pipeline') void this.buildStatusService.getPipelines(true);
      if (event.type === 'queue') void this.buildStatusService.getQueueStats(true);
    });
  }

  async ngOnInit(): Promise<void> {
    this.appService.updateSeoTags(
      this.meta,
      'Build status',
      'Current build status and queue information for Chaotic-AUR',
      'Chaotic-AUR, Repository, Packages, Archlinux, AUR, Arch User Repository, Chaotic, Chaotic-AUR packages, Chaotic-AUR repository, Chaotic-AUR build status',
      this.router.url,
    );

    this.observer.observe(`(max-width: 1100px)`).subscribe((state) => {
      this.isWide.set(!state.matches);
      this.cdr.markForCheck();
    });

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

  typed(value: any): PipelineWithExternalStatus {
    return value;
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
