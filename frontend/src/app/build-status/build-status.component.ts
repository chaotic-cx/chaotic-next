import { Component, effect, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageToastService } from '@garudalinux/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { AppService } from '../app.service';
import { setPageSeo } from '../functions';
import { TitleComponent } from '../title/title.component';
import { StaleNoticeComponent } from '../ui-states/stale-notice.component';
import { UnknownValueComponent } from '../ui-states/unknown-value.component';
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
    TitleComponent,
    BuildStatusPipelinesComponent,
    BuildStatusDeploymentsComponent,
    BuildStatusPipelineDialogComponent,
    ActiveBuildsComponent,
    WaitingBuildsComponent,
    IdleBuildersComponent,
    TranslocoDirective,
    StaleNoticeComponent,
    UnknownValueComponent,
  ],
  templateUrl: './build-status.component.html',
  styleUrl: './build-status.component.css',
  providers: [MessageToastService],
})
export class BuildStatusComponent implements OnInit {
  appService = inject(AppService);
  buildStatusService = inject(BuildStatusService);
  messageToastService = inject(MessageToastService);
  router = inject(Router);
  route = inject(ActivatedRoute);
  private readonly transloco = inject(TranslocoService);

  readonly dialogData = signal<PipelineView | null>(null);
  readonly dialogVisible = signal<boolean>(false);

  constructor() {
    setPageSeo(
      this.transloco.translate('buildStatus.seo.title'),
      this.transloco.translate('buildStatus.seo.description'),
      this.transloco.translate('buildStatus.seo.keywords'),
    );

    this.appService.chaoticEvent.pipe(takeUntilDestroyed()).subscribe((event) => {
      this.buildStatusService.applyQueueEvent(event);
      if (event.type === 'pipeline') {
        this.buildStatusService.applyPipelineDelta(event.pipeline);
        if (this.dialogVisible()) {
          this.refreshDialogData();
        }
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
