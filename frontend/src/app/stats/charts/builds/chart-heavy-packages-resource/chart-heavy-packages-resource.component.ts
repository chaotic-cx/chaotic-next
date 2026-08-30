import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InputNumber } from '@openng/optimus-ui/inputnumber';
import { ALL_TIME_DAYS, AppService } from '../../../../app.service';
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
  roundToTenth,
} from '../../chart-config';
import { RESOURCE_METRICS, type ResourceMetricKey } from '../../chart-resource-metrics';

@Component({
  selector: 'chaotic-chart-heavy-packages-resource',
  imports: [ChartCardComponent, InputNumber, FormsModule],
  templateUrl: './chart-heavy-packages-resource.component.html',
  styleUrl: './chart-heavy-packages-resource.component.css',
})
export class ChartHeavyPackagesResourceComponent {
  private readonly appService = inject(AppService);
  private readonly statsService = inject(StatsService);

  readonly metric = input.required<ResourceMetricKey>();

  readonly amount = signal(20);

  protected readonly isMobile = isMobileSignal();
  protected readonly chartRowHeight = chartRowHeight;

  protected readonly metricDef = computed(() => RESOURCE_METRICS[this.metric()]);

  readonly chart = chartResource<{ pkgname: string; average: string }[]>(() =>
    this.appService.getHeavyPackagesByResourceRequest(
      this.metric(),
      clampAmount(this.amount()),
      this.statsService.timeRangeDays() ?? ALL_TIME_DAYS,
    ),
  );

  protected readonly hasData = computed(() => {
    const labels = this.chartConfig().data.labels;
    return (labels?.length ?? 0) > 0;
  });

  protected readonly chartConfig = computed<ChartConfig<'bar'>>(() => {
    const data = this.chart.data();
    const metric = this.metricDef();
    return {
      data: {
        labels: data.map((d) => (this.isMobile() ? truncateLabel(d.pkgname) : d.pkgname)),
        datasets: [
          {
            label: `${metric.label} per build (${metric.unit})`,
            data: data.map((d) => roundToTenth(parseCount(d.average) * metric.scale)),
            backgroundColor: CATPPUCCIN_FLAVOURS,
          },
        ],
      },
      options: mochaAxisChartOptions<'bar'>({ indexAxis: 'y' }),
    };
  });

  /** Keeps the package-count input at a sane minimum. */
  protected setAmount(value: number | null | undefined): void {
    this.amount.set(clampAmount(value));
  }
}
