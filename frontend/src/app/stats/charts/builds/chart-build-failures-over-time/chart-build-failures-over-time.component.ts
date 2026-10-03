import { Component, computed, inject } from '@angular/core';
import type { AccentName } from '@catppuccin/palette';
import { ALL_TIME_DAYS, AppService } from '../../../../app.service';
import { parseCount } from '../../../../functions';
import { cycledColor } from '../../../../theme';
import { StatsService } from '../../../stats.service';
import { ChartCardComponent } from '../../chart-card/chart-card.component';
import { chartResource, type ChartConfig, formatDay, axisChartOptions } from '../../chart-config';

interface FailedBuildRow {
  day: string;
  pkgname: string;
  count: string;
}

const TOP_PACKAGES = 10;
const SERIES_COLOR_NAMES: readonly AccentName[] = [
  'red',
  'peach',
  'yellow',
  'green',
  'teal',
  'sky',
  'blue',
  'lavender',
  'pink',
  'mauve',
];

@Component({
  selector: 'chaotic-chart-build-failures-over-time',
  imports: [ChartCardComponent],
  templateUrl: './chart-build-failures-over-time.component.html',
  styleUrl: './chart-build-failures-over-time.component.css',
})
export class ChartBuildFailuresOverTimeComponent {
  private readonly appService = inject(AppService);
  private readonly statsService = inject(StatsService);

  readonly chart = chartResource<FailedBuildRow[]>(() =>
    this.appService.getFailedBuildsOverTimeResourceRequest(
      TOP_PACKAGES,
      this.statsService.timeRangeDays() ?? ALL_TIME_DAYS,
    ),
  );

  readonly chartConfig = computed<ChartConfig<'line'>>(() => {
    const rows = this.chart.data();

    const daySet = new Set<string>();
    const byPackage = new Map<string, Map<string, number>>();
    for (const row of rows) {
      const day = formatDay(row.day);
      daySet.add(day);
      if (!byPackage.has(row.pkgname)) byPackage.set(row.pkgname, new Map());
      byPackage.get(row.pkgname)?.set(day, parseCount(row.count));
    }
    const labels = [...daySet].reverse();
    const packages = [...byPackage.keys()];

    return {
      data: {
        labels,
        datasets: packages.map((pkg, index) => ({
          label: pkg,
          data: labels.map((day) => byPackage.get(pkg)?.get(day) ?? 0),
          backgroundColor: cycledColor(SERIES_COLOR_NAMES, index),
          borderColor: cycledColor(SERIES_COLOR_NAMES, index),
          fill: false,
        })),
      },
      options: axisChartOptions<'line'>(),
    };
  });
}
