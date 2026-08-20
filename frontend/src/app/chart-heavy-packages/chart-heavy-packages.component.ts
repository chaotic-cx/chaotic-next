import { httpResource } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import { UIChart } from '@openng/optimus-ui/chart';
import { ALL_TIME_DAYS, AppService } from '../app.service';
import { type ChartConfig, mochaAxisChartOptions } from '../chart-config';
import { resourceValue } from '../functions';
import { StatsService } from '../stats/stats.service';
import { CATPPUCCIN_FLAVOURS } from '../theme';

const TOP_PACKAGES = 25;

@Component({
  selector: 'chaotic-chart-heavy-packages',
  imports: [UIChart],
  templateUrl: './chart-heavy-packages.component.html',
  styleUrl: './chart-heavy-packages.component.css',
})
export class ChartHeavyPackagesComponent {
  private readonly appService = inject(AppService);
  private readonly statsService = inject(StatsService);

  private readonly resource = httpResource<{ pkgname: string; average: string }[]>(() =>
    this.appService.getHeavyPackagesResourceRequest(TOP_PACKAGES, this.statsService.timeRangeDays() ?? ALL_TIME_DAYS),
  );

  readonly loading = this.resource.isLoading;
  readonly hasData = computed(() => this.resource.hasValue());

  readonly chartConfig = computed<ChartConfig<'bar'>>(() => {
    const data = resourceValue(this.resource) ?? [];
    return {
      data: {
        labels: data.map((d) => d.pkgname),
        datasets: [
          {
            label: 'Average Build Time (seconds)',
            data: data.map((d) => parseFloat(d.average)),
            backgroundColor: CATPPUCCIN_FLAVOURS,
          },
        ],
      },
      options: mochaAxisChartOptions<'bar'>('y'),
    };
  });
}
