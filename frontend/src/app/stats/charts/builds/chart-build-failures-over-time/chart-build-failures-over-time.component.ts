import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import { flavors } from '@catppuccin/palette';
import { UIChart } from '@openng/optimus-ui/chart';
import { ALL_TIME_DAYS, AppService } from '../../../../app.service';
import { parseCount, resourceValue } from '../../../../functions';
import { StatsService } from '../../../stats.service';
import { type ChartConfig, mochaAxisChartOptions } from '../../chart-config';

interface FailedBuildRow {
  day: string;
  pkgname: string;
  count: string;
}

const TOP_PACKAGES = 10;
const SERIES_COLORS = [
  flavors.mocha.colors.red.hex,
  flavors.mocha.colors.peach.hex,
  flavors.mocha.colors.yellow.hex,
  flavors.mocha.colors.green.hex,
  flavors.mocha.colors.teal.hex,
  flavors.mocha.colors.sky.hex,
  flavors.mocha.colors.blue.hex,
  flavors.mocha.colors.lavender.hex,
  flavors.mocha.colors.pink.hex,
  flavors.mocha.colors.mauve.hex,
];

@Component({
  selector: 'chaotic-chart-build-failures-over-time',
  imports: [UIChart],
  templateUrl: './chart-build-failures-over-time.component.html',
  styleUrl: './chart-build-failures-over-time.component.css',
  providers: [DatePipe],
})
export class ChartBuildFailuresOverTimeComponent {
  private readonly appService = inject(AppService);
  private readonly datePipe = inject(DatePipe);
  private readonly statsService = inject(StatsService);

  private readonly resource = httpResource<FailedBuildRow[]>(() =>
    this.appService.getFailedBuildsOverTimeResourceRequest(
      TOP_PACKAGES,
      this.statsService.timeRangeDays() ?? ALL_TIME_DAYS,
    ),
  );

  readonly loading = this.resource.isLoading;
  readonly hasData = computed(() => this.resource.hasValue());

  readonly chartConfig = computed<ChartConfig<'line'>>(() => {
    const rows = resourceValue(this.resource) ?? [];

    const daySet = new Set<string>();
    const byPackage = new Map<string, Map<string, number>>();
    for (const row of rows) {
      const day = this.datePipe.transform(row.day, 'shortDate') || row.day;
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
          backgroundColor: SERIES_COLORS[index % SERIES_COLORS.length],
          borderColor: SERIES_COLORS[index % SERIES_COLORS.length],
          fill: false,
        })),
      },
      options: mochaAxisChartOptions<'line'>(),
    };
  });
}
