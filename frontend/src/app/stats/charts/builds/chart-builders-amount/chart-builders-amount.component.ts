import { Component, computed, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { AppService } from '../../../../app.service';
import { parseCount } from '../../../../functions';
import { injectActiveTranslation } from '../../../../i18n/active-translation';
import { StatsService } from '../../../stats.service';
import { ChartCardComponent } from '../../chart-card/chart-card.component';
import { chartResource, type ChartConfig, mochaAxisChartOptions, SINGLE_SERIES_COLOR } from '../../chart-config';

@Component({
  selector: 'chaotic-chart-builders-amount',
  imports: [ChartCardComponent],
  templateUrl: './chart-builders-amount.component.html',
  styleUrl: './chart-builders-amount.component.css',
})
export class ChartBuildersAmountComponent {
  private readonly appService = inject(AppService);
  private readonly statsService = inject(StatsService);
  private readonly transloco = inject(TranslocoService);

  private readonly activeTranslation = injectActiveTranslation();

  readonly chart = chartResource<{ name: string; count: string }[]>(() =>
    this.appService.getBuildersAmountResourceRequest(this.statsService.timeRangeDays() ?? undefined),
  );

  readonly chartConfig = computed<ChartConfig<'bar'>>(() => {
    this.activeTranslation();

    const data = this.chart.data();
    const labels: string[] = [];
    const values: number[] = [];
    for (const item of data) {
      labels.push(item.name);
      values.push(parseCount(item.count));
    }

    return {
      data: {
        labels,
        datasets: [
          {
            data: values,
            label: this.transloco.translate('stats.charts.buildersAmount.label'),
            backgroundColor: SINGLE_SERIES_COLOR,
            borderRadius: 4,
          },
        ],
      },
      options: mochaAxisChartOptions<'bar'>({ showLegend: false }),
    };
  });
}
