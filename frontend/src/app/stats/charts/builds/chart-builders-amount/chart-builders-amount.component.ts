import { Component, computed, inject } from '@angular/core';
import { AppService } from '../../../../app.service';
import { parseCount } from '../../../../functions';
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

  readonly chart = chartResource<{ name: string; count: string }[]>(() =>
    this.appService.getBuildersAmountResourceRequest(this.statsService.timeRangeDays() ?? undefined),
  );

  readonly chartConfig = computed<ChartConfig<'bar'>>(() => {
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
            label: 'Builds per builder',
            backgroundColor: SINGLE_SERIES_COLOR,
            borderRadius: 4,
          },
        ],
      },
      options: mochaAxisChartOptions<'bar'>({ showLegend: false }),
    };
  });
}
