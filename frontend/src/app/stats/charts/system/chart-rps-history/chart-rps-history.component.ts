import { Component, computed, inject } from '@angular/core';
import type { RpsHistorySample } from '@chaotic-next/shared-lib';
import { AppService } from '../../../../app.service';
import { CATPPUCCIN_FLAVOURS } from '../../../../theme';
import { ChartCardComponent } from '../../chart-card/chart-card.component';
import { chartResource, type ChartConfig, mochaAxisChartOptions } from '../../chart-config';

const TIME_FORMATTER = new Intl.DateTimeFormat(navigator.language, { timeStyle: 'short' });

@Component({
  selector: 'chaotic-chart-rps-history',
  imports: [ChartCardComponent],
  templateUrl: './chart-rps-history.component.html',
  styleUrl: './chart-rps-history.component.css',
})
export class ChartRpsHistoryComponent {
  private readonly appService = inject(AppService);

  readonly chart = chartResource<RpsHistorySample[]>(() => this.appService.getRpsHistoryResourceRequest());

  protected readonly hasData = computed(() => (this.chartConfig().data.labels?.length ?? 0) > 0);

  protected readonly chartConfig = computed<ChartConfig<'line'>>(() => {
    const samples = [...this.chart.data()].sort((a, b) => a.timestamp - b.timestamp);
    return {
      data: {
        labels: samples.map((sample) => TIME_FORMATTER.format(new Date(sample.timestamp))),
        datasets: [
          {
            label: 'Requests per second',
            data: samples.map((sample) => sample.requests),
            backgroundColor: CATPPUCCIN_FLAVOURS[0],
            borderColor: CATPPUCCIN_FLAVOURS[0],
            fill: false as const,
            pointRadius: 0,
          },
        ],
      },
      options: mochaAxisChartOptions<'line'>(),
    };
  });
}
