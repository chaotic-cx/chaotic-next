import { Component, computed, inject } from '@angular/core';
import type { RpsHistorySample } from '@chaotic-next/shared-lib';
import { TranslocoService } from '@jsverse/transloco';
import { AppService } from '../../../../app.service';
import { injectActiveTranslation } from '../../../../i18n/active-translation';
import { ChartCardComponent } from '../../chart-card/chart-card.component';
import {
  chartResource,
  type ChartConfig,
  mochaAxisChartOptions,
  SINGLE_SERIES_COLOR,
  SINGLE_SERIES_FILL,
} from '../../chart-config';

const SPIKY_LINE_WIDTH_PX = 1.5;

const TIME_FORMATTER = new Intl.DateTimeFormat(navigator.language, { timeStyle: 'short' });

@Component({
  selector: 'chaotic-chart-rps-history',
  imports: [ChartCardComponent],
  templateUrl: './chart-rps-history.component.html',
  styleUrl: './chart-rps-history.component.css',
})
export class ChartRpsHistoryComponent {
  private readonly appService = inject(AppService);
  private readonly transloco = inject(TranslocoService);

  private readonly activeTranslation = injectActiveTranslation();

  readonly chart = chartResource<RpsHistorySample[]>(() => this.appService.getRpsHistoryResourceRequest());

  protected readonly hasData = computed(() => (this.chartConfig().data.labels?.length ?? 0) > 0);

  protected readonly chartConfig = computed<ChartConfig<'line'>>(() => {
    this.activeTranslation();

    const samples = [...this.chart.data()].sort((a, b) => a.timestamp - b.timestamp);
    return {
      data: {
        labels: samples.map((sample) => TIME_FORMATTER.format(new Date(sample.timestamp))),
        datasets: [
          {
            label: this.transloco.translate('stats.charts.rpsHistory.label'),
            data: samples.map((sample) => sample.requests),
            backgroundColor: SINGLE_SERIES_FILL,
            borderColor: SINGLE_SERIES_COLOR,
            borderWidth: SPIKY_LINE_WIDTH_PX,
            tension: 0,
            fill: 'origin' as const,
          },
        ],
      },
      options: mochaAxisChartOptions<'line'>({ showLegend: false }),
    };
  });
}
