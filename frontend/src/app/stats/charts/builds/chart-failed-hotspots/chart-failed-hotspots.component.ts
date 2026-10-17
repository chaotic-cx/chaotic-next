import { Component, computed, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { ALL_TIME_DAYS, AppService } from '../../../../app.service';
import { LoadErrorComponent } from '../../../../load-error/load-error.component';
import { StatsService } from '../../../stats.service';
import { chartResource } from '../../chart-config';

/**
 * Matches the backend MAX_AMOUNT clamp on the hotspots endpoint, so the
 * list shows every failing package instead of a chart-sized top slice.
 */
const MAX_HOTSPOTS = 100;

@Component({
  selector: 'chaotic-chart-failed-hotspots',
  imports: [LoadErrorComponent, TranslocoDirective],
  templateUrl: './chart-failed-hotspots.component.html',
})
export class ChartFailedHotspotsComponent {
  private readonly appService = inject(AppService);
  private readonly statsService = inject(StatsService);

  readonly chart = chartResource<{ pkgname: string; count: string }[]>(() =>
    this.appService.getTopFailedBuildsResourceRequest(MAX_HOTSPOTS, this.statsService.timeRangeDays() ?? ALL_TIME_DAYS),
  );

  readonly visibleRows = computed(() => this.chart.data());
}
