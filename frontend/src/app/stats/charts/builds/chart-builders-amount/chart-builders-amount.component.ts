import { httpResource } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import { UIChart } from '@openng/optimus-ui/chart';
import { AppService } from '../../../../app.service';
import { parseCount, resourceValue, shuffleArray } from '../../../../functions';
import { CATPPUCCIN_FLAVOURS } from '../../../../theme';
import { StatsService } from '../../../stats.service';
import { type ChartConfig, mochaAxisChartOptions } from '../../chart-config';

@Component({
  selector: 'chaotic-chart-builders-amount',
  imports: [UIChart],
  templateUrl: './chart-builders-amount.component.html',
  styleUrl: './chart-builders-amount.component.css',
})
export class ChartBuildersAmountComponent {
  private readonly appService = inject(AppService);
  private readonly statsService = inject(StatsService);

  private readonly resource = httpResource<{ name: string; count: string }[]>(() =>
    this.appService.getBuildersAmountResourceRequest(this.statsService.timeRangeDays() ?? undefined),
  );

  readonly loading = this.resource.isLoading;

  readonly hasData = computed(() => this.resource.hasValue());

  readonly chartConfig = computed<ChartConfig<'bar'>>(() => {
    const data = resourceValue(this.resource) ?? [];
    const labels: string[] = [];
    const values: number[] = [];
    for (const item of data) {
      labels.push(item.name);
      values.push(parseCount(item.count));
    }

    return {
      data: {
        labels,
        datasets: [
          {
            data: values,
            label: 'Builds per builder',
            backgroundColor: shuffleArray(CATPPUCCIN_FLAVOURS),
          },
        ],
      },
      options: mochaAxisChartOptions<'bar'>(),
    };
  });
}
