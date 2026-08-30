import { Component, computed, inject } from '@angular/core';
import { flavors } from '@catppuccin/palette';
import { ALL_TIME_DAYS, AppService } from '../../../../app.service';
import { isMobileSignal, parseCount, truncateLabel } from '../../../../functions';
import { StatsService } from '../../../stats.service';
import { ChartCardComponent } from '../../chart-card/chart-card.component';
import { chartResource, type ChartConfig, mochaAxisChartOptions } from '../../chart-config';

const TOP_PACKAGES = 12;

@Component({
  selector: 'chaotic-chart-failed-hotspots',
  imports: [ChartCardComponent],
  templateUrl: './chart-failed-hotspots.component.html',
  styleUrl: './chart-failed-hotspots.component.css',
})
export class ChartFailedHotspotsComponent {
  private readonly appService = inject(AppService);
  private readonly statsService = inject(StatsService);

  readonly chart = chartResource<{ pkgname: string; count: string }[]>(() =>
    this.appService.getTopFailedBuildsResourceRequest(TOP_PACKAGES, this.statsService.timeRangeDays() ?? ALL_TIME_DAYS),
  );

  protected readonly isMobile = isMobileSignal();

  readonly chartConfig = computed<ChartConfig<'bar'>>(() => {
    const rows = this.chart.data();
    const labels = rows.map((r) => (this.isMobile() ? truncateLabel(r.pkgname) : r.pkgname));
    const data = rows.map((r) => parseCount(r.count));
    return {
      data: {
        labels,
        datasets: [
          {
            label: 'Failed builds',
            data,
            backgroundColor: flavors.mocha.colors.red.hex,
          },
        ],
      },
      options: mochaAxisChartOptions<'bar'>({ indexAxis: 'y' }),
    };
  });
}
