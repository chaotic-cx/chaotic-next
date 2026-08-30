import { Component, computed, inject } from '@angular/core';
import { flavors } from '@catppuccin/palette';
import { ALL_TIME_DAYS, AppService } from '../../../../app.service';
import { parseCount } from '../../../../functions';
import { StatsService } from '../../../stats.service';
import { ChartCardComponent } from '../../chart-card/chart-card.component';
import { chartResource, type ChartConfig, formatDay, mochaAxisChartOptions } from '../../chart-config';

const UA_COLORS = [
  flavors.mocha.colors.mauve.hex,
  flavors.mocha.colors.blue.hex,
  flavors.mocha.colors.green.hex,
  flavors.mocha.colors.peach.hex,
  flavors.mocha.colors.red.hex,
];

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
          backgroundColor: UA_COLORS[i % UA_COLORS.length],
          borderColor: UA_COLORS[i % UA_COLORS.length],
          fill: false,
        })),
      },
      options: mochaAxisChartOptions<'line'>(),
    };
  });
}
