import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, computed, inject, input } from '@angular/core';
import { flavors } from '@catppuccin/palette';
import type { PackageResourceDayRow } from '@chaotic-next/shared-lib';
import { UIChart } from '@openng/optimus-ui/chart';
import { ALL_TIME_DAYS, AppService } from '../app.service';
import { RESOURCE_METRICS, RESOURCE_METRIC_ORDER, type ResourceMetricKey } from '../chart-resource-metrics';
import { type ChartConfig, mochaAxisChartOptions } from '../chart-config';
import { parseCount, resourceValue } from '../functions';
import { StatsService } from '../stats/stats.service';

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
  imports: [UIChart],
  templateUrl: './chart-package-resource-stats.component.html',
  styleUrl: './chart-package-resource-stats.component.css',
  providers: [DatePipe],
})
export class ChartPackageResourceStatsComponent {
  private readonly appService = inject(AppService);
  private readonly datePipe = inject(DatePipe);
  private readonly statsService = inject(StatsService);

  readonly packageName = input.required<string>();

  private readonly resource = httpResource<PackageResourceDayRow[]>(() => {
    const name = this.packageName();
    if (!name) return undefined;
    return this.appService.getPackageResourceStatsResourceRequest(
      name,
      this.statsService.timeRangeDays() ?? ALL_TIME_DAYS,
    );
  });

  readonly loading = this.resource.isLoading;

  /** One chart per metric; empty until the package has sampled builds, so
   * nothing renders without data. */
  protected readonly charts = computed<PackageResourceChart[]>(() => {
    const rows = resourceValue(this.resource);
    if (!rows || rows.length === 0) return [];
    return RESOURCE_METRIC_ORDER.map((key) => ({
      key,
      config: this.buildChartConfig(key, rows),
    }));
  });

  private buildChartConfig(metricKey: ResourceMetricKey, rows: PackageResourceDayRow[]): ChartConfig<'line'> {
    const sorted = [...rows].sort((a, b) => a.day.localeCompare(b.day));
    const labels = sorted.map((row) => this.datePipe.transform(row.day, 'shortDate') || row.day);
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

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}
