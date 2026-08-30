import { Component, computed, inject } from '@angular/core';
import { flavors } from '@catppuccin/palette';
import { ALL_TIME_DAYS, AppService } from '../../../../app.service';
import { parseCount } from '../../../../functions';
import { StatsService } from '../../../stats.service';
import { ChartCardComponent } from '../../chart-card/chart-card.component';
import { chartResource, type ChartConfig, formatDay, mochaAxisChartOptions } from '../../chart-config';

@Component({
  selector: 'chaotic-chart-builds-per-day',
  imports: [ChartCardComponent],
  templateUrl: './chart-builds-per-day.component.html',
  styleUrl: './chart-builds-per-day.component.css',
})
export class ChartBuildsPerDayComponent {
  private readonly appService = inject(AppService);
  private readonly statsService = inject(StatsService);

  readonly chart = chartResource<{ day: string; count: string }[]>(() =>
    this.appService.getBuildsPerDayResourceRequest(this.statsService.timeRangeDays() ?? ALL_TIME_DAYS),
  );

  readonly chartConfig = computed<ChartConfig<'line'>>(() => {
    const labels: string[] = [];
    const values: number[] = [];
    for (const item of this.chart.data()) {
      labels.push(formatDay(item.day));
      values.push(parseCount(item.count));
    }

    return {
      data: {
        labels,
        datasets: [
          {
            label: 'Builds per day',
            data: values,
            backgroundColor: flavors.mocha.colors.lavender.hex,
            borderColor: flavors.mocha.colors.lavender.hex,
            fill: false,
          },
        ],
      },
      options: mochaAxisChartOptions<'line'>(),
    };
  });
}
