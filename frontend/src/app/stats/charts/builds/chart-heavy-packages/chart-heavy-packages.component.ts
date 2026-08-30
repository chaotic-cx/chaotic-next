import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InputNumber } from '@openng/optimus-ui/inputnumber';
import { ALL_TIME_DAYS, AppService } from '../../../../app.service';
import { isMobileSignal, truncateLabel } from '../../../../functions';
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
  selector: 'chaotic-chart-heavy-packages',
  imports: [ChartCardComponent, InputNumber, FormsModule],
  templateUrl: './chart-heavy-packages.component.html',
  styleUrl: './chart-heavy-packages.component.css',
})
export class ChartHeavyPackagesComponent {
  private readonly appService = inject(AppService);
  private readonly statsService = inject(StatsService);

  readonly amount = signal(20);

  protected readonly isMobile = isMobileSignal();
  protected readonly chartRowHeight = chartRowHeight;

  protected setAmount(value: number): void {
    this.amount.set(clampAmount(value));
  }

  readonly chart = chartResource<{ pkgname: string; average: string }[]>(() =>
    this.appService.getHeavyPackagesResourceRequest(
      clampAmount(this.amount()),
      this.statsService.timeRangeDays() ?? ALL_TIME_DAYS,
    ),
  );

  readonly chartConfig = computed<ChartConfig<'bar'>>(() => {
    const data = this.chart.data();
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
