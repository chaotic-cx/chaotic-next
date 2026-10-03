import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { InputNumber } from '@openng/optimus-ui/inputnumber';
import { ALL_TIME_DAYS, AppService } from '../../../../app.service';
import { isMobileSignal, truncateLabel } from '../../../../functions';
import { injectActiveTranslation } from '../../../../i18n/active-translation';
import { StatsService } from '../../../stats.service';
import { ChartCardComponent } from '../../chart-card/chart-card.component';
import {
  chartResource,
  chartRowHeight,
  clampAmount,
  type ChartConfig,
  mochaAxisChartOptions,
  SINGLE_SERIES_COLOR,
} from '../../chart-config';

@Component({
  selector: 'chaotic-chart-heavy-packages',
  imports: [ChartCardComponent, InputNumber, FormsModule, TranslocoDirective],
  templateUrl: './chart-heavy-packages.component.html',
  styleUrl: './chart-heavy-packages.component.css',
})
export class ChartHeavyPackagesComponent {
  private readonly appService = inject(AppService);
  private readonly statsService = inject(StatsService);
  private readonly transloco = inject(TranslocoService);

  private readonly activeTranslation = injectActiveTranslation();

  readonly amount = signal(20);

  protected readonly isMobile = isMobileSignal();
  protected readonly chartRowHeight = chartRowHeight;

  protected setAmount(value: number): void {
    this.amount.set(clampAmount(value));
  }

  readonly chart = chartResource<{ pkgname: string; average: string }[]>(() =>
    this.appService.getHeavyPackagesResourceRequest(
      clampAmount(this.amount()),
      this.statsService.timeRangeDays() ?? ALL_TIME_DAYS,
    ),
  );

  readonly chartConfig = computed<ChartConfig<'bar'>>(() => {
    this.activeTranslation();

    const data = this.chart.data();
    return {
      data: {
        labels: data.map((d) => (this.isMobile() ? truncateLabel(d.pkgname) : d.pkgname)),
        datasets: [
          {
            label: this.transloco.translate('stats.charts.heavyPackages.label'),
            data: data.map((d) => parseFloat(d.average)),
            backgroundColor: SINGLE_SERIES_COLOR,
            borderRadius: 4,
          },
        ],
      },
      options: mochaAxisChartOptions<'bar'>({ indexAxis: 'y', showLegend: false }),
    };
  });
}
