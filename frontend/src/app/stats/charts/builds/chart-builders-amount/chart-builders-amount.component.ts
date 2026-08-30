import { Component, computed, inject } from '@angular/core';
import { AppService } from '../../../../app.service';
import { parseCount, shuffleArray } from '../../../../functions';
import { CATPPUCCIN_FLAVOURS } from '../../../../theme';
import { StatsService } from '../../../stats.service';
import { ChartCardComponent } from '../../chart-card/chart-card.component';
import { chartResource, type ChartConfig, mochaAxisChartOptions } from '../../chart-config';

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
            backgroundColor: shuffleArray(CATPPUCCIN_FLAVOURS),
          },
        ],
      },
      options: mochaAxisChartOptions<'bar'>(),
    };
  });
}
