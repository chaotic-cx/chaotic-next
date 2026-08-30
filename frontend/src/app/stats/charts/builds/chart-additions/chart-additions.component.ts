import { Component, computed, inject } from '@angular/core';
import { flavors } from '@catppuccin/palette';
import { ALL_TIME_DAYS, AppService } from '../../../../app.service';
import { parseCount } from '../../../../functions';
import { StatsService } from '../../../stats.service';
import { ChartCardComponent } from '../../chart-card/chart-card.component';
import { chartResource, type ChartConfig, formatDay, mochaAxisChartOptions } from '../../chart-config';

@Component({
  selector: 'chaotic-chart-additions',
  imports: [ChartCardComponent],
  templateUrl: './chart-additions.component.html',
  styleUrl: './chart-additions.component.css',
})
export class ChartAdditionsComponent {
  private readonly appService = inject(AppService);
  private readonly statsService = inject(StatsService);

  readonly chart = chartResource<{ day: string; count: string }[]>(() =>
    this.appService.getPackageAdditionsResourceRequest(this.statsService.timeRangeDays() ?? ALL_TIME_DAYS),
  );

  readonly chartConfig = computed<ChartConfig<'line'>>(() => {
    const labels: string[] = [];
    const values: number[] = [];
    for (const row of this.chart.data()) {
      labels.push(formatDay(row.day));
      values.push(parseCount(row.count));
    }
    return {
      data: {
        labels: labels.reverse(),
        datasets: [
          {
            label: 'Packages added',
            data: values.reverse(),
            backgroundColor: flavors.mocha.colors.green.hex,
            borderColor: flavors.mocha.colors.green.hex,
            fill: false,
          },
        ],
      },
      options: mochaAxisChartOptions<'line'>(),
    };
  });
}
