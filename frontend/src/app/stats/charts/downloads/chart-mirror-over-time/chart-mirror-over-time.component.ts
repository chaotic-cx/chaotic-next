import { Component, computed, inject } from '@angular/core';
import { ALL_TIME_DAYS, AppService } from '../../../../app.service';
import { StatsService } from '../../../stats.service';
import { ChartCardComponent } from '../../chart-card/chart-card.component';
import {
  chartResource,
  type ChartConfig,
  formatDay,
  groupOverTimeChart,
  mochaAxisChartOptions,
} from '../../chart-config';

interface MirrorRow {
  day: string;
  mirror: string;
  count: string;
}

@Component({
  selector: 'chaotic-chart-mirror-over-time',
  imports: [ChartCardComponent],
  templateUrl: './chart-mirror-over-time.component.html',
  styleUrl: './chart-mirror-over-time.component.css',
})
export class ChartMirrorOverTimeComponent {
  private readonly appService = inject(AppService);
  private readonly statsService = inject(StatsService);

  readonly chart = chartResource<MirrorRow[]>(() =>
    this.appService.getMirrorStatsOverTimeResourceRequest(
      this.statsService.timeRangeDays() ?? ALL_TIME_DAYS,
      this.statsService.selectedRepo() || undefined,
    ),
  );

  readonly chartConfig = computed<ChartConfig<'line'>>(() => {
    const rows = this.chart.data().map((row) => ({
      day: row.day,
      group: row.mirror,
      count: row.count,
    }));
    const { labels, datasets } = groupOverTimeChart(rows, formatDay);
    return {
      data: { labels, datasets },
      options: { ...mochaAxisChartOptions<'line'>(), aspectRatio: 2 },
    };
  });
}
