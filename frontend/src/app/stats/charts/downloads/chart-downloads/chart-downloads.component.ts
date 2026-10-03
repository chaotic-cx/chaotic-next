import { Component, computed, inject, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PackageRankList } from '@chaotic-next/shared-lib';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { InputNumber } from '@openng/optimus-ui/inputnumber';
import { AppService } from '../../../../app.service';
import { isMobileSignal, truncateLabel } from '../../../../functions';
import { injectActiveTranslation } from '../../../../i18n/active-translation';
import { StatsService } from '../../../stats.service';
import { ChartCardComponent } from '../../chart-card/chart-card.component';
import {
  chartResource,
  chartRowHeight,
  clampAmount,
  type ChartConfig,
  mochaAxisChartOptions,
  SINGLE_SERIES_COLOR,
} from '../../chart-config';

@Component({
  selector: 'chaotic-chart-downloads',
  imports: [ChartCardComponent, InputNumber, FormsModule, TranslocoDirective],
  templateUrl: './chart-downloads.component.html',
  styleUrl: './chart-downloads.component.css',
})
export class ChartDownloadsComponent {
  private readonly appService = inject(AppService);
  private readonly statsService = inject(StatsService);
  private readonly transloco = inject(TranslocoService);

  private readonly activeTranslation = injectActiveTranslation();

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
    this.activeTranslation();

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
            label: this.transloco.translate('stats.charts.downloads.label'),
            backgroundColor: SINGLE_SERIES_COLOR,
            borderRadius: 4,
          },
        ],
      },
      options: mochaAxisChartOptions<'bar'>({ indexAxis: 'y', showLegend: false }),
    };
  });
}
