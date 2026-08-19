import { httpResource } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UIChart } from '@openng/optimus-ui/chart';
import { InputNumber } from '@openng/optimus-ui/inputnumber';
import { AppService } from '../app.service';
import { type ChartConfig, mochaAxisChartOptions } from '../chart-config';
import { parseCount, resourceValue } from '../functions';
import { StatsService } from '../stats/stats.service';
import { CATPPUCCIN_FLAVOURS } from '../theme';

@Component({
  selector: 'chaotic-chart-popular-packages',
  imports: [UIChart, InputNumber, FormsModule],
  templateUrl: './chart-popular-packages.component.html',
  styleUrl: './chart-popular-packages.component.css',
})
export class ChartPopularPackagesComponent {
  private readonly appService = inject(AppService);
  private readonly statsService = inject(StatsService);

  readonly amount = signal<number>(20);

  private readonly resource = httpResource<{ pkgbase_pkgname: string; count: string }[]>(() =>
    this.appService.getPopularPackagesResourceRequest(this.amount(), this.statsService.timeRangeDays() ?? undefined),
  );

  readonly loading = this.resource.isLoading;

  readonly hasData = computed(() => this.resource.hasValue());

  readonly chartConfig = computed<ChartConfig<'bar'>>(() => {
    const data = resourceValue(this.resource) ?? [];
    const labels: string[] = [];
    const values: number[] = [];
    for (const item of data) {
      labels.push(item.pkgbase_pkgname);
      values.push(parseCount(item.count));
    }

    return {
      data: {
        labels,
        datasets: [
          {
            data: values,
            label: 'Build count',
            backgroundColor: CATPPUCCIN_FLAVOURS,
          },
        ],
      },
      options: mochaAxisChartOptions<'bar'>('y'),
    };
  });
}
