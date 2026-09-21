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
  selector: 'chaotic-chart-top-aur-scans',
  imports: [ChartCardComponent, InputNumber, FormsModule],
  templateUrl: './chart-top-aur-scans.component.html',
  styleUrl: './chart-top-aur-scans.component.css',
})
export class ChartTopAurScansComponent {
  private readonly appService = inject(AppService);
  private readonly statsService = inject(StatsService);

  readonly amount = signal(20);

  protected readonly isMobile = isMobileSignal();
  protected readonly chartRowHeight = chartRowHeight;

  protected setAmount(value: number): void {
    this.amount.set(clampAmount(value));
  }

  readonly chart = chartResource<{ packageName: string; count: string }[]>(() =>
    this.appService.getTopScannedAurPackagesResourceRequest(
      clampAmount(this.amount()),
      this.statsService.timeRangeDays() ?? undefined,
    ),
  );

  readonly chartConfig = computed<ChartConfig<'bar'>>(() => {
    const labels: string[] = [];
    const values: number[] = [];
    for (const item of this.chart.data()) {
      labels.push(this.isMobile() ? truncateLabel(item.packageName) : item.packageName);
      values.push(parseCount(item.count));
    }

    return {
      data: {
        labels,
        datasets: [
          {
            data: values,
            label: 'Scan count',
            backgroundColor: CATPPUCCIN_FLAVOURS,
          },
        ],
      },
      options: mochaAxisChartOptions<'bar'>({ indexAxis: 'y' }),
    };
  });
}
