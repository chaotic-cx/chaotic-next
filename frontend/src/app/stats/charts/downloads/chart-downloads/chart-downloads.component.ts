import { Component, computed, inject, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PackageRankList } from '@chaotic-next/shared-lib';
import { InputNumber } from '@openng/optimus-ui/inputnumber';
import { AppService } from '../../../../app.service';
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
  selector: 'chaotic-chart-downloads',
  imports: [ChartCardComponent, InputNumber, FormsModule],
  templateUrl: './chart-downloads.component.html',
  styleUrl: './chart-downloads.component.css',
})
export class ChartDownloadsComponent {
  private readonly appService = inject(AppService);
  private readonly statsService = inject(StatsService);

  readonly range = model(20);

  protected readonly isMobile = isMobileSignal();
  protected readonly chartRowHeight = chartRowHeight;

  protected setRange(value: number): void {
    this.range.set(clampAmount(value));
  }

  readonly chart = chartResource<PackageRankList>(() => {
    const val = clampAmount(this.range());
    return this.appService.getOverallPackageStatsResourceRequest(
      val,
      this.statsService.timeRangeDays() ?? undefined,
      this.statsService.selectedRepo() || undefined,
    );
  });

  readonly chartConfig = computed<ChartConfig<'bar'>>(() => {
    const labels: string[] = [];
    const data: number[] = [];
    for (const pkg of this.chart.data()) {
      labels.push(this.isMobile() ? truncateLabel(pkg.name) : pkg.name);
      data.push(pkg.count);
    }

    return {
      data: {
        labels,
        datasets: [
          {
            data,
            label: 'Download count',
            backgroundColor: CATPPUCCIN_FLAVOURS,
          },
        ],
      },
      options: mochaAxisChartOptions<'bar'>({ indexAxis: 'y' }),
    };
  });
}
