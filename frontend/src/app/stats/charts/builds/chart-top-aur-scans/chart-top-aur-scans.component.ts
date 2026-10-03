import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { InputNumber } from '@openng/optimus-ui/inputnumber';
import { AppService } from '../../../../app.service';
import { isMobileSignal, parseCount, truncateLabel } from '../../../../functions';
import { injectActiveTranslation } from '../../../../i18n/active-translation';
import { StatsService } from '../../../stats.service';
import { ChartCardComponent } from '../../chart-card/chart-card.component';
import {
  chartResource,
  chartRowHeight,
  clampAmount,
  type ChartConfig,
  axisChartOptions,
  singleSeriesColor,
} from '../../chart-config';

@Component({
  selector: 'chaotic-chart-top-aur-scans',
  imports: [ChartCardComponent, InputNumber, FormsModule, TranslocoDirective],
  templateUrl: './chart-top-aur-scans.component.html',
  styleUrl: './chart-top-aur-scans.component.css',
})
export class ChartTopAurScansComponent {
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

  readonly chart = chartResource<{ packageName: string; count: string }[]>(() =>
    this.appService.getTopScannedAurPackagesResourceRequest(
      clampAmount(this.amount()),
      this.statsService.timeRangeDays() ?? undefined,
    ),
  );

  readonly chartConfig = computed<ChartConfig<'bar'>>(() => {
    this.activeTranslation();

    const labels: string[] = [];
    const values: number[] = [];
    for (const item of this.chart.data()) {
      labels.push(this.isMobile() ? truncateLabel(item.packageName) : item.packageName);
      values.push(parseCount(item.count));
    }

    return {
      data: {
        labels,
        datasets: [
          {
            data: values,
            label: this.transloco.translate('stats.charts.topAurScans.label'),
            backgroundColor: singleSeriesColor(),
          },
        ],
      },
      options: axisChartOptions<'bar'>({ indexAxis: 'y', showLegend: false }),
    };
  });
}
