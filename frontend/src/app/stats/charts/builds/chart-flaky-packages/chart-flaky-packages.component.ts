import { Component, computed, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { ALL_TIME_DAYS, AppService } from '../../../../app.service';
import { LoadErrorComponent } from '../../../../load-error/load-error.component';
import { StatsService } from '../../../stats.service';
import { chartResource } from '../../chart-config';

export interface FlakyPackageRow {
  pkgname: string;
  attempts: number;
  failures: number;
  /** Failure rate from 0 to 1. */
  flakiness: number;
}

@Component({
  selector: 'chaotic-chart-flaky-packages',
  imports: [LoadErrorComponent, TranslocoDirective],
  templateUrl: './chart-flaky-packages.component.html',
})
export class ChartFlakyPackagesComponent {
  private readonly appService = inject(AppService);
  private readonly statsService = inject(StatsService);

  readonly chart = chartResource<FlakyPackageRow[]>(() =>
    this.appService.getFlakiestPackagesResourceRequest(this.statsService.timeRangeDays() ?? ALL_TIME_DAYS),
  );

  readonly visibleRows = computed(() => this.chart.data());

  protected failurePercent(row: FlakyPackageRow): number {
    return Math.round(row.flakiness * 100);
  }
}
