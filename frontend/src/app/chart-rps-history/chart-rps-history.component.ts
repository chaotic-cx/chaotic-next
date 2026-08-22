import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import type { RpsHistorySample } from '@chaotic-next/shared-lib';
import { UIChart } from '@openng/optimus-ui/chart';
import { AppService } from '../app.service';
import { type ChartConfig, mochaAxisChartOptions } from '../chart-config';
import { resourceValue } from '../functions';
import { CATPPUCCIN_FLAVOURS } from '../theme';

@Component({
  selector: 'chaotic-chart-rps-history',
  imports: [UIChart],
  templateUrl: './chart-rps-history.component.html',
  styleUrl: './chart-rps-history.component.css',
  providers: [DatePipe],
})
export class ChartRpsHistoryComponent {
  private readonly appService = inject(AppService);
  private readonly datePipe = inject(DatePipe);

  private readonly resource = httpResource<RpsHistorySample[]>(() => this.appService.getRpsHistoryResourceRequest());

  readonly loading = this.resource.isLoading;

  protected readonly hasData = computed(() => (this.chartConfig().data.labels?.length ?? 0) > 0);

  protected readonly chartConfig = computed<ChartConfig<'line'>>(() => {
    const samples = [...(resourceValue(this.resource) ?? [])].sort((a, b) => a.timestamp - b.timestamp);
    return {
      data: {
        labels: samples.map((sample) => this.datePipe.transform(sample.timestamp, 'shortTime') || ''),
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
