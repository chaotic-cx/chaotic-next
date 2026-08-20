import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import { BuildStatus, isBuildStatus, STATUS_DISPLAY_NAMES } from '@chaotic-next/shared-lib';
import { UIChart } from '@openng/optimus-ui/chart';
import { ALL_TIME_DAYS, AppService } from '../app.service';
import { type ChartConfig, mochaAxisChartOptions } from '../chart-config';
import { resourceValue } from '../functions';
import { StatsService } from '../stats/stats.service';
import { CATPPUCCIN_FLAVOURS } from '../theme';

@Component({
  selector: 'chaotic-chart-average-build-time-trend',
  imports: [UIChart],
  templateUrl: './chart-average-build-time-trend.component.html',
  styleUrl: './chart-average-build-time-trend.component.css',
  providers: [DatePipe],
})
export class ChartAverageBuildTimeTrendComponent {
  private readonly appService = inject(AppService);
  private readonly datePipe = inject(DatePipe);
  private readonly statsService = inject(StatsService);

  private readonly resource = httpResource<{ day: string; status: string; average: string }[]>(() =>
    this.appService.getAverageBuildTimePerDayResourceRequest(this.statsService.timeRangeDays() ?? ALL_TIME_DAYS),
  );

  readonly loading = this.resource.isLoading;
  readonly hasData = computed(() => this.resource.hasValue());

  readonly chartConfig = computed<ChartConfig<'line'>>(() => {
    const rows = resourceValue(this.resource) ?? [];
    const statuses = [...new Set(rows.map((r) => Number(r.status)))]
      .filter(isBuildStatus)
      .filter((s) => s !== BuildStatus.TIMED_OUT);

    const daySet = new Set<string>();
    for (const row of rows) {
      const day = this.datePipe.transform(row.day, 'shortDate') || row.day;
      daySet.add(day);
    }
    // The API returns newest-first; present chronologically.
    const labels = [...daySet].reverse();

    const series = new Map<BuildStatus, Map<string, number>>();
    for (const status of statuses) series.set(status, new Map());
    for (const row of rows) {
      const day = this.datePipe.transform(row.day, 'shortDate') || row.day;
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
