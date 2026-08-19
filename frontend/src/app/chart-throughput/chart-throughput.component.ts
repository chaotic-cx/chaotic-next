import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import { flavors } from '@catppuccin/palette';
import { UIChart } from '@openng/optimus-ui/chart';
import { ALL_TIME_DAYS, AppService } from '../app.service';
import { type ChartConfig, mochaAxisChartOptions } from '../chart-config';
import { parseCount, resourceValue } from '../functions';
import { StatsService } from '../stats/stats.service';

interface ThroughputRow {
  day: string;
  success: string;
  alreadyBuilt: string;
  skipped: string;
  failed: string;
}

const SERIES: {
  key: keyof Pick<ThroughputRow, 'success' | 'alreadyBuilt' | 'skipped' | 'failed'>;
  label: string;
  color: string;
}[] = [
  { key: 'success', label: 'Successful', color: flavors.mocha.colors.green.hex },
  { key: 'alreadyBuilt', label: 'Already built', color: flavors.mocha.colors.blue.hex },
  { key: 'skipped', label: 'Skipped', color: flavors.mocha.colors.yellow.hex },
  { key: 'failed', label: 'Failed', color: flavors.mocha.colors.red.hex },
];

@Component({
  selector: 'chaotic-chart-throughput',
  imports: [UIChart],
  templateUrl: './chart-throughput.component.html',
  styleUrl: './chart-throughput.component.css',
  providers: [DatePipe],
})
export class ChartThroughputComponent {
  private readonly appService = inject(AppService);
  private readonly datePipe = inject(DatePipe);
  private readonly statsService = inject(StatsService);

  private readonly resource = httpResource<ThroughputRow[]>(() =>
    this.appService.getThroughputResourceRequest(this.statsService.timeRangeDays() ?? ALL_TIME_DAYS),
  );

  readonly loading = this.resource.isLoading;
  readonly hasData = computed(() => this.resource.hasValue());

  readonly chartConfig = computed<ChartConfig<'line'>>(() => {
    const rows = resourceValue(this.resource) ?? [];
    const daySet = new Set<string>();
    for (const row of rows) {
      const day = this.datePipe.transform(row.day, 'shortDate') || row.day;
      daySet.add(day);
    }
    const labels = [...daySet].reverse();

    const byDay = new Map<string, ThroughputRow>();
    for (const row of rows) {
      const day = this.datePipe.transform(row.day, 'shortDate') || row.day;
      byDay.set(day, row);
    }

    return {
      data: {
        labels,
        datasets: SERIES.map((series) => ({
          label: series.label,
          data: labels.map((day) => parseCount(byDay.get(day)?.[series.key] ?? '0')),
          backgroundColor: series.color,
          borderColor: series.color,
          fill: false,
        })),
      },
      options: mochaAxisChartOptions<'line'>(),
    };
  });
}
