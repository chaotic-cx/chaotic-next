import { Component, computed, inject, input } from '@angular/core';
import { flavors } from '@catppuccin/palette';
import type { PackageResourceDayRow } from '@chaotic-next/shared-lib';
import { ALL_TIME_DAYS, AppService } from '../../../../app.service';
import { parseCount } from '../../../../functions';
import { StatsService } from '../../../stats.service';
import { ChartCardComponent } from '../../chart-card/chart-card.component';
import { chartResource, type ChartConfig, formatDay, mochaAxisChartOptions, roundToTenth } from '../../chart-config';
import { RESOURCE_METRIC_ORDER, RESOURCE_METRICS, type ResourceMetricKey } from '../../chart-resource-metrics';

type ResourceDayValueKey = Exclude<keyof PackageResourceDayRow, 'day' | 'samples'>;

interface ResourceSeries {
  rowKey: ResourceDayValueKey;
  label: string;
  color: string;
}

const METRIC_SERIES: Record<ResourceMetricKey, ResourceSeries[]> = {
  memory: [
    { rowKey: 'avg_memory_bytes', label: 'Average memory', color: flavors.mocha.colors.lavender.hex },
    { rowKey: 'peak_memory_bytes', label: 'Peak memory', color: flavors.mocha.colors.blue.hex },
  ],
  cpu: [{ rowKey: 'cpu_time_ns', label: 'CPU time', color: flavors.mocha.colors.green.hex }],
  disk: [{ rowKey: 'disk_io_bytes', label: 'Disk I/O', color: flavors.mocha.colors.yellow.hex }],
  network: [{ rowKey: 'network_io_bytes', label: 'Network I/O', color: flavors.mocha.colors.teal.hex }],
};

export interface PackageResourceChart {
  key: ResourceMetricKey;
  config: ChartConfig<'line'>;
}

@Component({
  selector: 'chaotic-chart-package-resource-stats',
  imports: [ChartCardComponent],
  templateUrl: './chart-package-resource-stats.component.html',
  styleUrl: './chart-package-resource-stats.component.css',
})
export class ChartPackageResourceStatsComponent {
  private readonly appService = inject(AppService);
  private readonly statsService = inject(StatsService);

  readonly packageName = input.required<string>();

  readonly chart = chartResource<PackageResourceDayRow[]>(() => {
    const name = this.packageName();
    if (!name) return undefined;
    return this.appService.getPackageResourceStatsResourceRequest(
      name,
      this.statsService.timeRangeDays() ?? ALL_TIME_DAYS,
    );
  });

  /** One chart per metric; empty until the package has sampled builds, so
   * nothing renders without data. */
  protected readonly charts = computed<PackageResourceChart[]>(() => {
    const rows = this.chart.data();
    if (rows.length === 0) return [];
    return RESOURCE_METRIC_ORDER.map((key) => ({
      key,
      config: this.buildChartConfig(key, rows),
    }));
  });

  private buildChartConfig(metricKey: ResourceMetricKey, rows: PackageResourceDayRow[]): ChartConfig<'line'> {
    const sorted = [...rows].sort((a, b) => a.day.localeCompare(b.day));
    const labels = sorted.map((row) => formatDay(row.day));
    const metric = RESOURCE_METRICS[metricKey];

    return {
      data: {
        labels,
        datasets: METRIC_SERIES[metricKey].map(({ rowKey, label, color }) => ({
          label: `${label} (${metric.unit})`,
          data: sorted.map((row) => roundToTenth(parseCount(row[rowKey]) * metric.scale)),
          backgroundColor: color,
          borderColor: color,
          fill: false as const,
        })),
      },
      options: mochaAxisChartOptions<'line'>(),
    };
  }
}
