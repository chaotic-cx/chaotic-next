import { Component, computed, inject, input } from '@angular/core';
import { ALL_TIME_DAYS, AppService } from '../../../../app.service';
import { CATPPUCCIN_FLAVOURS } from '../../../../theme';
import { StatsService } from '../../../stats.service';
import { ChartCardComponent } from '../../chart-card/chart-card.component';
import { chartResource, type ChartConfig, formatDay, mochaAxisChartOptions, roundToTenth } from '../../chart-config';

@Component({
  selector: 'chaotic-chart-package-average-build-time',
  imports: [ChartCardComponent],
  templateUrl: './chart-package-average-build-time.component.html',
})
export class ChartPackageAverageBuildTimeComponent {
  private readonly appService = inject(AppService);
  private readonly statsService = inject(StatsService);

  readonly packageName = input.required<string>();

  readonly chart = chartResource<{ day: string; average: string }[]>(() => {
    const name = this.packageName();
    if (!name) return undefined;
    return this.appService.getAverageBuildTimePerDayForPackageResourceRequest(
      name,
      this.statsService.timeRangeDays() ?? ALL_TIME_DAYS,
    );
  });

  readonly chartConfig = computed<ChartConfig<'line'> | null>(() => {
    const rows = this.chart.data();
    if (rows.length === 0) return null;

    const daySet = new Set<string>();
    for (const row of rows) {
      daySet.add(formatDay(row.day));
    }
    const labels = [...daySet].reverse();

    const dataMap = new Map<string, number>();
    for (const row of rows) {
      dataMap.set(formatDay(row.day), roundToTenth(Number(row.average)));
    }

    return {
      data: {
        labels,
        datasets: [
          {
            label: `Average build time (minutes) for ${this.packageName()}`,
            data: labels.map((day) => dataMap.get(day) ?? 0),
            backgroundColor: CATPPUCCIN_FLAVOURS[0],
            borderColor: CATPPUCCIN_FLAVOURS[0],
            fill: false,
          },
        ],
      },
      options: mochaAxisChartOptions<'line'>(),
    };
  });

  readonly loadingChart: ChartConfig<'line'> = {
    data: { labels: [], datasets: [] },
    options: mochaAxisChartOptions<'line'>(),
  };
}
