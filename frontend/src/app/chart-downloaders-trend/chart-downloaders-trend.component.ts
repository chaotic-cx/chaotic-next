import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import { flavors } from '@catppuccin/palette';
import { UIChart } from '@openng/optimus-ui/chart';
import { ALL_TIME_DAYS, AppService } from '../app.service';
import { type ChartConfig, mochaAxisChartOptions } from '../chart-config';
import { parseCount, resourceValue } from '../functions';
import { StatsService } from '../stats/stats.service';

const UA_COLORS = [
  flavors.mocha.colors.mauve.hex,
  flavors.mocha.colors.blue.hex,
  flavors.mocha.colors.green.hex,
  flavors.mocha.colors.peach.hex,
  flavors.mocha.colors.red.hex,
];

@Component({
  selector: 'chaotic-chart-downloaders-trend',
  imports: [UIChart],
  templateUrl: './chart-downloaders-trend.component.html',
  styleUrl: './chart-downloaders-trend.component.css',
  providers: [DatePipe],
})
export class ChartDownloadersTrendComponent {
  private readonly appService = inject(AppService);
  private readonly datePipe = inject(DatePipe);
  private readonly statsService = inject(StatsService);

  private readonly resource = httpResource<{ day: string; userAgent: string; count: string }[]>(() =>
    this.appService.getUserAgentTrendResourceRequest(this.statsService.timeRangeDays() ?? ALL_TIME_DAYS),
  );

  readonly loading = this.resource.isLoading;
  readonly hasData = computed(() => this.resource.hasValue());

  readonly chartConfig = computed<ChartConfig<'line'>>(() => {
    const rows = resourceValue(this.resource) ?? [];
    const agents = [...new Set(rows.map((r) => r.userAgent))];
    const labels: string[] = [];
    const series = new Map(agents.map((a) => [a, [] as number[]]));
    for (const row of rows) {
      const formattedDate = this.datePipe.transform(row.day, 'shortDate');
      if (!labels.includes(formattedDate || row.day)) labels.push(formattedDate || row.day);
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
