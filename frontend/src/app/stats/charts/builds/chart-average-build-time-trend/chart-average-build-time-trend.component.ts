import { Component, computed, inject } from '@angular/core';
import { BuildStatus, isBuildStatus, STATUS_DISPLAY_NAMES } from '@chaotic-next/shared-lib';
import { ALL_TIME_DAYS, AppService } from '../../../../app.service';
import { CATPPUCCIN_FLAVOURS } from '../../../../theme';
import { StatsService } from '../../../stats.service';
import { ChartCardComponent } from '../../chart-card/chart-card.component';
import { chartResource, type ChartConfig, formatDay, mochaAxisChartOptions } from '../../chart-config';

@Component({
  selector: 'chaotic-chart-average-build-time-trend',
  imports: [ChartCardComponent],
  templateUrl: './chart-average-build-time-trend.component.html',
  styleUrl: './chart-average-build-time-trend.component.css',
})
export class ChartAverageBuildTimeTrendComponent {
  private readonly appService = inject(AppService);
  private readonly statsService = inject(StatsService);

  readonly chart = chartResource<{ day: string; status: string; average: string }[]>(() =>
    this.appService.getAverageBuildTimePerDayResourceRequest(this.statsService.timeRangeDays() ?? ALL_TIME_DAYS),
  );

  readonly chartConfig = computed<ChartConfig<'line'>>(() => {
    const rows = this.chart.data();
    const statuses = [...new Set(rows.map((r) => Number(r.status)))]
      .filter(isBuildStatus)
      .filter((s) => s !== BuildStatus.TIMED_OUT);

    const daySet = new Set<string>();
    for (const row of rows) {
      daySet.add(formatDay(row.day));
    }
    // The API returns newest-first; present chronologically.
    const labels = [...daySet].reverse();

    const series = new Map<BuildStatus, Map<string, number>>();
    for (const status of statuses) series.set(status, new Map());
    for (const row of rows) {
      const day = formatDay(row.day);
      const status = Number(row.status);
      if (!isBuildStatus(status)) continue;
      series.get(status)?.set(day, Number(row.average));
    }

    return {
      data: {
        labels,
        datasets: statuses.map((status, i) => ({
          label: STATUS_DISPLAY_NAMES[status],
          data: labels.map((day) => series.get(status)?.get(day) ?? 0),
          backgroundColor: CATPPUCCIN_FLAVOURS[i % CATPPUCCIN_FLAVOURS.length],
          borderColor: CATPPUCCIN_FLAVOURS[i % CATPPUCCIN_FLAVOURS.length],
          fill: false,
        })),
      },
      options: mochaAxisChartOptions<'line'>(),
    };
  });
}
