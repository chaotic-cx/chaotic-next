import { httpResource } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UIChart } from '@openng/optimus-ui/chart';
import { InputNumber } from '@openng/optimus-ui/inputnumber';
import { ALL_TIME_DAYS, AppService } from '../app.service';
import { type ChartConfig, mochaAxisChartOptions } from '../chart-config';
import { isMobileSignal, resourceValue, truncateLabel } from '../functions';
import { StatsService } from '../stats/stats.service';
import { CATPPUCCIN_FLAVOURS } from '../theme';

@Component({
  selector: 'chaotic-chart-heavy-packages',
  imports: [UIChart, InputNumber, FormsModule],
  templateUrl: './chart-heavy-packages.component.html',
  styleUrl: './chart-heavy-packages.component.css',
})
export class ChartHeavyPackagesComponent {
  private readonly appService = inject(AppService);
  private readonly statsService = inject(StatsService);

  readonly amount = signal(20);

  protected readonly Math = Math;
  protected readonly isMobile = isMobileSignal();

  private readonly resource = httpResource<{ pkgname: string; average: string }[]>(() => {
    const val = Math.max(1, this.amount() || 1);
    return this.appService.getHeavyPackagesResourceRequest(val, this.statsService.timeRangeDays() ?? ALL_TIME_DAYS);
  });

  readonly loading = this.resource.isLoading;
  readonly hasData = computed(() => this.resource.hasValue());

  readonly chartConfig = computed<ChartConfig<'bar'>>(() => {
    const data = resourceValue(this.resource) ?? [];
    return {
      data: {
        labels: data.map((d) => (this.isMobile() ? truncateLabel(d.pkgname) : d.pkgname)),
        datasets: [
          {
            label: 'Average Build Time (minutes)',
            data: data.map((d) => parseFloat(d.average)),
            backgroundColor: CATPPUCCIN_FLAVOURS,
          },
        ],
      },
      options: mochaAxisChartOptions<'bar'>({ indexAxis: 'y' }),
    };
  });
}
