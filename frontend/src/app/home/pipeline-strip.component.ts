import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { AppService } from '../app.service';
import { BuildStatusService } from '../build-status/build-status.service';
import { LoadErrorComponent } from '../load-error/load-error.component';
import { RelativeTimePipe } from '../pipes/relative-time.pipe';
import { statusIconClass } from '../status-icons';
import { StaleNoticeComponent } from '../ui-states/stale-notice.component';
import { UnknownValueComponent } from '../ui-states/unknown-value.component';

const STAGE_PREVIEW_SIZE = 4;

@Component({
  selector: 'chaotic-pipeline-strip',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    RelativeTimePipe,
    LoadErrorComponent,
    StaleNoticeComponent,
    UnknownValueComponent,
    TranslocoDirective,
  ],
  templateUrl: './pipeline-strip.component.html',
  styleUrl: './pipeline-strip.component.css',
})
export class PipelineStripComponent {
  private readonly appService = inject(AppService);
  protected readonly buildStatusService = inject(BuildStatusService);

  protected readonly statusIconClass = statusIconClass;
  protected readonly placeholderRows = Array.from({ length: STAGE_PREVIEW_SIZE });

  protected readonly waiting = computed(() => this.buildStatusService.waitingQueue().slice(0, STAGE_PREVIEW_SIZE));
  protected readonly waitingOverflow = computed(
    () => this.buildStatusService.waitingQueue().length - this.waiting().length,
  );

  protected readonly active = computed(() => this.buildStatusService.activeQueue().slice(0, STAGE_PREVIEW_SIZE));
  protected readonly activeOverflow = computed(
    () => this.buildStatusService.activeQueue().length - this.active().length,
  );

  protected readonly deployed = computed(() =>
    this.buildStatusService.latestDeployments().slice(0, STAGE_PREVIEW_SIZE),
  );
  protected readonly lastDeployment = computed(() => this.buildStatusService.latestDeployments()[0]);

  protected readonly sseConnected = this.appService.sseConnected;

  protected retryAll(): void {
    this.buildStatusService.refreshQueueStats();
    this.buildStatusService.refreshPackageBuilds();
  }

  constructor() {
    this.appService.chaoticEvent
      .pipe(takeUntilDestroyed())
      .subscribe((event) => this.buildStatusService.applyQueueEvent(event));
  }
}
