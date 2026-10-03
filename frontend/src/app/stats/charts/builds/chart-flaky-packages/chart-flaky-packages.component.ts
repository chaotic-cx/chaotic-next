import { Component, computed, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { ALL_TIME_DAYS, AppService } from '../../../../app.service';
import { isMobileSignal, truncateLabel } from '../../../../functions';
import { injectActiveTranslation } from '../../../../i18n/active-translation';
import { themePalette } from '../../../../theme';
import { StatsService } from '../../../stats.service';
import { ChartCardComponent } from '../../chart-card/chart-card.component';
import { chartResource, type ChartConfig, axisChartOptions } from '../../chart-config';

export interface FlakyPackageRow {
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
  private readonly transloco = inject(TranslocoService);

  private readonly activeTranslation = injectActiveTranslation();

  readonly chart = chartResource<FlakyPackageRow[]>(() =>
    this.appService.getFlakiestPackagesResourceRequest(this.statsService.timeRangeDays() ?? ALL_TIME_DAYS),
  );

  protected readonly isMobile = isMobileSignal();

  readonly chartConfig = computed<ChartConfig<'bar'>>(() => {
    this.activeTranslation();

    const rows = this.chart.data().slice(0, TOP_PACKAGES);
    const labels = rows.map((row) => (this.isMobile() ? truncateLabel(row.pkgname) : row.pkgname));
    const data = rows.map((row) => Math.round(row.flakiness * 100));
    return {
      data: {
        labels,
        datasets: [
          {
            label: this.transloco.translate('stats.charts.flakyPackages.label'),
            data,
            backgroundColor: themePalette().peach.hex,
          },
        ],
      },
      options: axisChartOptions<'bar'>({ indexAxis: 'y' }),
    };
  });
}
