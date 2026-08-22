import { httpResource } from '@angular/common/http';
import { Component, computed, inject, input } from '@angular/core';
import { UIChart } from '@openng/optimus-ui/chart';
import { ALL_TIME_DAYS, AppService } from '../app.service';
import { RESOURCE_METRICS, type ResourceMetricKey } from '../chart-resource-metrics';
import { type ChartConfig, mochaAxisChartOptions } from '../chart-config';
import { resourceValue } from '../functions';
import { StatsService } from '../stats/stats.service';
import { CATPPUCCIN_FLAVOURS } from '../theme';

@Component({
  selector: 'chaotic-chart-heavy-packages-resource-metric',
  imports: [UIChart],
  templateUrl: './chart-heavy-packages-resource-metric.component.html',
  styleUrl: './chart-heavy-packages-resource.component.css',
})
export class ChartHeavyPackagesResourceMetricComponent {
  private readonly appService = inject(AppService);
  private readonly statsService = inject(StatsService);

  readonly metric = input.required<ResourceMetricKey>();
  readonly amount = input(20);

  protected readonly Math = Math;

  protected readonly metricDef = computed(() => RESOURCE_METRICS[this.metric()]);

  private readonly resource = httpResource<{ pkgname: string; average: string }[]>(() => {
    const amount = this.amount();
    if (!Number.isInteger(amount) || amount < 1) return undefined;
    return this.appService.getHeavyPackagesByResourceRequest(
      this.metric(),
      amount,
      this.statsService.timeRangeDays() ?? ALL_TIME_DAYS,
    );
  });

  readonly loading = this.resource.isLoading;
  readonly hasData = computed(() => this.resource.hasValue());

  readonly chartConfig = computed<ChartConfig<'bar'>>(() => {
    const data = resourceValue(this.resource) ?? [];
    const def = this.metricDef();
    return {
      data: {
        labels: data.map((d) => d.pkgname),
        datasets: [
          {
            label: `Average ${def.label} (${def.unit})`,
            data: data.map((d) => Math.round(parseAverage(d.average) * def.scale * 10) / 10),
            backgroundColor: CATPPUCCIN_FLAVOURS,
          },
        ],
      },
      options: mochaAxisChartOptions<'bar'>('y'),
    };
  });
}

function parseAverage(raw: string): number {
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}
