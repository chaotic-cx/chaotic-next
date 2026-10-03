import { Component, computed, inject } from '@angular/core';
import type { AccentName } from '@catppuccin/palette';
import { ALL_TIME_DAYS, AppService } from '../../../../app.service';
import { parseCount } from '../../../../functions';
import { cycledColor } from '../../../../theme';
import { StatsService } from '../../../stats.service';
import { ChartCardComponent } from '../../chart-card/chart-card.component';
import { chartResource, type ChartConfig, formatDay, axisChartOptions } from '../../chart-config';

const UA_COLOR_NAMES: readonly AccentName[] = ['mauve', 'blue', 'green', 'peach', 'red'];

@Component({
  selector: 'chaotic-chart-downloaders-trend',
  imports: [ChartCardComponent],
  templateUrl: './chart-downloaders-trend.component.html',
  styleUrl: './chart-downloaders-trend.component.css',
})
export class ChartDownloadersTrendComponent {
  private readonly appService = inject(AppService);
  private readonly statsService = inject(StatsService);

  readonly chart = chartResource<{ day: string; userAgent: string; count: string }[]>(() =>
    this.appService.getUserAgentTrendResourceRequest(
      this.statsService.timeRangeDays() ?? ALL_TIME_DAYS,
      this.statsService.selectedRepo() || undefined,
    ),
  );

  readonly chartConfig = computed<ChartConfig<'line'>>(() => {
    const rows = this.chart.data();
    const agents = [...new Set(rows.map((r) => r.userAgent))];
    const labels: string[] = [];
    const series = new Map(agents.map((a) => [a, [] as number[]]));
    for (const row of rows) {
      const day = formatDay(row.day);
      if (!labels.includes(day)) labels.push(day);
      series.get(row.userAgent)?.push(parseCount(row.count));
    }
    return {
      data: {
        labels,
        datasets: agents.map((agent, i) => ({
          label: agent,
          data: series.get(agent) ?? [],
          backgroundColor: cycledColor(UA_COLOR_NAMES, i),
          borderColor: cycledColor(UA_COLOR_NAMES, i),
          fill: false,
        })),
      },
      options: axisChartOptions<'line'>(),
    };
  });
}
