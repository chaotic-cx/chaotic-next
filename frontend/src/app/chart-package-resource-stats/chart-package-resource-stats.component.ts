import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { flavors } from '@catppuccin/palette';
import type { PackageResourceDayRow } from '@chaotic-next/shared-lib';
import { UIChart } from '@openng/optimus-ui/chart';
import { Select } from '@openng/optimus-ui/select';
import { ALL_TIME_DAYS, AppService } from '../app.service';
import { type ChartConfig, mochaAxisChartOptions } from '../chart-config';
import { RESOURCE_METRIC_SELECT_OPTIONS, RESOURCE_METRICS, type ResourceMetricKey } from '../chart-resource-metrics';
import { parseCount, resourceValue } from '../functions';
import { StatsService } from '../stats/stats.service';

type ResourceDayValueKey = Exclude<keyof PackageResourceDayRow, 'day' | 'samples'>;

interface ResourceDataset {
  rowKeys: { key: ResourceDayValueKey; label: string; color: string }[];
}

const METRIC_DATASETS: Record<ResourceMetricKey, ResourceDataset> = {
  memory: {
    rowKeys: [
      { key: 'avg_memory_bytes', label: 'Average memory', color: flavors.mocha.colors.lavender.hex },
      { key: 'peak_memory_bytes', label: 'Peak memory', color: flavors.mocha.colors.blue.hex },
    ],
  },
  cpu: { rowKeys: [{ key: 'cpu_time_ns', label: 'CPU time', color: flavors.mocha.colors.green.hex }] },
  disk: { rowKeys: [{ key: 'disk_io_bytes', label: 'Disk I/O', color: flavors.mocha.colors.yellow.hex }] },
  network: { rowKeys: [{ key: 'network_io_bytes', label: 'Network I/O', color: flavors.mocha.colors.teal.hex }] },
};

@Component({
  selector: 'chaotic-chart-package-resource-stats',
  imports: [UIChart, Select, FormsModule],
  templateUrl: './chart-package-resource-stats.component.html',
  styleUrl: './chart-package-resource-stats.component.css',
  providers: [DatePipe],
})
export class ChartPackageResourceStatsComponent {
  private readonly appService = inject(AppService);
  private readonly datePipe = inject(DatePipe);
  private readonly statsService = inject(StatsService);

  readonly packageName = input.required<string>();

  protected readonly metricOptions = RESOURCE_METRIC_SELECT_OPTIONS;
  protected readonly selectedMetric = signal<ResourceMetricKey>('memory');

  private readonly resource = httpResource<PackageResourceDayRow[]>(() => {
    const name = this.packageName();
    if (!name) return undefined;
    return this.appService.getPackageResourceStatsResourceRequest(
      name,
      this.statsService.timeRangeDays() ?? ALL_TIME_DAYS,
    );
  });

  readonly loading = this.resource.isLoading;

  protected readonly chartConfig = computed<ChartConfig<'line'> | null>(() => {
    const rows = resourceValue(this.resource);
    if (!rows || rows.length === 0) return null;
    return this.buildChartConfig(rows);
  });

  private buildChartConfig(rows: PackageResourceDayRow[]): ChartConfig<'line'> {
    const sorted = [...rows].sort((a, b) => a.day.localeCompare(b.day));
    const labels = sorted.map((row) => this.datePipe.transform(row.day, 'shortDate') || row.day);

    const metric = RESOURCE_METRICS[this.selectedMetric()];
    const series = METRIC_DATASETS[this.selectedMetric()].rowKeys;

    return {
      data: {
        labels,
        datasets: series.map(({ key, label, color }) => ({
          label: `${label} (${metric.unit})`,
          data: sorted.map((row) => roundToTenth(parseCount(row[key]) * metric.scale)),
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
