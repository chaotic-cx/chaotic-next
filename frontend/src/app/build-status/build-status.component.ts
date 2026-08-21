import { CommonModule } from '@angular/common';
import { Component, effect, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageToastService } from '@garudalinux/core';
import { Card } from '@openng/optimus-ui/card';
import { Skeleton } from '@openng/optimus-ui/skeleton';
import { AppService } from '../app.service';
import { TitleComponent } from '../title/title.component';
import { ActiveBuildsComponent } from './active-builds.component';
import { BuildStatusDeploymentsComponent } from './build-status-deployments.component';
import { BuildStatusPipelineDialogComponent } from './build-status-pipeline-dialog.component';
import { BuildStatusPipelinesComponent } from './build-status-pipelines.component';
import { BuildStatusService, PipelineView } from './build-status.service';
import { IdleBuildersComponent } from './idle-builders.component';
import { WaitingBuildsComponent } from './waiting-builds.component';

@Component({
  selector: 'chaotic-build-status',
  imports: [
    CommonModule,
    Card,
    Skeleton,
    TitleComponent,
    BuildStatusPipelinesComponent,
    BuildStatusDeploymentsComponent,
    BuildStatusPipelineDialogComponent,
    ActiveBuildsComponent,
    WaitingBuildsComponent,
    IdleBuildersComponent,
  ],
  templateUrl: './build-status.component.html',
  providers: [MessageToastService],
})
export class BuildStatusComponent implements OnInit {
  appService = inject(AppService);
  buildStatusService = inject(BuildStatusService);
  messageToastService = inject(MessageToastService);
  meta = inject(Meta);
  router = inject(Router);
  route = inject(ActivatedRoute);

  readonly dialogData = signal<PipelineView | null>(null);
  readonly dialogVisible = signal<boolean>(false);

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
      if (event.type === 'queue_promoted') {
        void this.buildStatusService.refreshPackageBuilds();
        void this.buildStatusService.refreshQueueStats();
      }
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
}
