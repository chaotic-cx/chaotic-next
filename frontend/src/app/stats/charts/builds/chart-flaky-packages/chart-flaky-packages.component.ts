import { Component, computed, inject } from '@angular/core';
import { flavors } from '@catppuccin/palette';
import { ALL_TIME_DAYS, AppService } from '../../../../app.service';
import { isMobileSignal, truncateLabel } from '../../../../functions';
import { StatsService } from '../../../stats.service';
import { ChartCardComponent } from '../../chart-card/chart-card.component';
import { chartResource, type ChartConfig, mochaAxisChartOptions } from '../../chart-config';

interface FlakyPackageRow {
  pkgname: string;
  attempts: number;
  failures: number;
  /** Failure rate from 0 to 1. */
  flakiness: number;
}

const TOP_PACKAGES = 12;

@Component({
  selector: 'chaotic-chart-flaky-packages',
  imports: [ChartCardComponent],
  templateUrl: './chart-flaky-packages.component.html',
  styleUrl: './chart-flaky-packages.component.css',
})
export class ChartFlakyPackagesComponent {
  private readonly appService = inject(AppService);
  private readonly statsService = inject(StatsService);

  readonly chart = chartResource<FlakyPackageRow[]>(() =>
    this.appService.getFlakiestPackagesResourceRequest(this.statsService.timeRangeDays() ?? ALL_TIME_DAYS),
  );

  protected readonly isMobile = isMobileSignal();

  readonly chartConfig = computed<ChartConfig<'bar'>>(() => {
    const rows = this.chart.data().slice(0, TOP_PACKAGES);
    const labels = rows.map((row) => (this.isMobile() ? truncateLabel(row.pkgname) : row.pkgname));
    const data = rows.map((row) => Math.round(row.flakiness * 100));
    return {
      data: {
        labels,
        datasets: [
          {
            label: 'Failure rate (%)',
            data,
            backgroundColor: flavors.mocha.colors.peach.hex,
          },
        ],
      },
      options: mochaAxisChartOptions<'bar'>({ indexAxis: 'y' }),
    };
  });
}
