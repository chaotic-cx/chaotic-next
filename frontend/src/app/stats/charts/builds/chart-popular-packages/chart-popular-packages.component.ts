import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InputNumber } from '@openng/optimus-ui/inputnumber';
import { AppService } from '../../../../app.service';
import { isMobileSignal, parseCount, truncateLabel } from '../../../../functions';
import { CATPPUCCIN_FLAVOURS } from '../../../../theme';
import { StatsService } from '../../../stats.service';
import { ChartCardComponent } from '../../chart-card/chart-card.component';
import {
  chartResource,
  chartRowHeight,
  clampAmount,
  type ChartConfig,
  mochaAxisChartOptions,
} from '../../chart-config';

@Component({
  selector: 'chaotic-chart-popular-packages',
  imports: [ChartCardComponent, InputNumber, FormsModule],
  templateUrl: './chart-popular-packages.component.html',
  styleUrl: './chart-popular-packages.component.css',
})
export class ChartPopularPackagesComponent {
  private readonly appService = inject(AppService);
  private readonly statsService = inject(StatsService);

  readonly amount = signal(20);

  protected readonly isMobile = isMobileSignal();
  protected readonly chartRowHeight = chartRowHeight;

  protected setAmount(value: number): void {
    this.amount.set(clampAmount(value));
  }

  readonly chart = chartResource<{ pkgbase_pkgname: string; count: string }[]>(() =>
    this.appService.getPopularPackagesResourceRequest(
      clampAmount(this.amount()),
      this.statsService.timeRangeDays() ?? undefined,
    ),
  );

  readonly chartConfig = computed<ChartConfig<'bar'>>(() => {
    const labels: string[] = [];
    const values: number[] = [];
    for (const item of this.chart.data()) {
      labels.push(this.isMobile() ? truncateLabel(item.pkgbase_pkgname) : item.pkgbase_pkgname);
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
      options: mochaAxisChartOptions<'bar'>({ indexAxis: 'y' }),
    };
  });
}
