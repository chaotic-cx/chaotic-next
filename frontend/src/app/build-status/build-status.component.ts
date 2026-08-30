import { CommonModule } from '@angular/common';
import { Component, effect, ElementRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageToastService } from '@garudalinux/core';
import { Card } from '@openng/optimus-ui/card';
import { ProgressSpinner } from '@openng/optimus-ui/progressspinner';
import { AppService } from '../app.service';
import { isMobileSignal, setPageSeo } from '../functions';
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
    ProgressSpinner,
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
  router = inject(Router);
  route = inject(ActivatedRoute);

  readonly dialogData = signal<PipelineView | null>(null);
  readonly dialogVisible = signal<boolean>(false);
  readonly contentEl = viewChild<ElementRef<HTMLDivElement>>('statusContent');
  readonly isMobile = isMobileSignal();

  constructor() {
    setPageSeo(
      'Build status',
      'Current build status and queue information for Chaotic-AUR',
      'Chaotic-AUR, Repository, Packages, Archlinux, AUR, Arch User Repository, Chaotic, Chaotic-AUR packages, Chaotic-AUR repository, Chaotic-AUR build status',
    );
    effect(() => {
      if (this.buildStatusService.initialLoaded()) {
        const el = this.contentEl()?.nativeElement;
        if (el) this.buildStatusService.cardMinHeight.set(el.offsetHeight);
      }
    });

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
    this.buildStatusService.beginNavigation();
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
