import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import { flavors } from '@catppuccin/palette';
import { UIChart } from '@openng/optimus-ui/chart';
import { ALL_TIME_DAYS, AppService } from '../../../../app.service';
import { parseCount, resourceValue } from '../../../../functions';
import { StatsService } from '../../../stats.service';
import { type ChartConfig, mochaAxisChartOptions } from '../../chart-config';

@Component({
  selector: 'chaotic-chart-additions',
  imports: [UIChart],
  templateUrl: './chart-additions.component.html',
  styleUrl: './chart-additions.component.css',
  providers: [DatePipe],
})
export class ChartAdditionsComponent {
  private readonly appService = inject(AppService);
  private readonly datePipe = inject(DatePipe);
  private readonly statsService = inject(StatsService);

  private readonly resource = httpResource<{ day: string; count: string }[]>(() =>
    this.appService.getPackageAdditionsResourceRequest(this.statsService.timeRangeDays() ?? ALL_TIME_DAYS),
  );

  readonly loading = this.resource.isLoading;

  readonly hasData = computed(() => this.resource.hasValue());

  readonly chartConfig = computed<ChartConfig<'line'>>(() => {
    const rows = resourceValue(this.resource) ?? [];
    const labels: string[] = [];
    const values: number[] = [];
    for (const row of rows) {
      const formattedDate = this.datePipe.transform(row.day, 'shortDate');
      labels.push(formattedDate || row.day);
      values.push(parseCount(row.count));
    }
    return {
      data: {
        labels: labels.reverse(),
        datasets: [
          {
            label: 'Packages added',
            data: values.reverse(),
            backgroundColor: flavors.mocha.colors.green.hex,
            borderColor: flavors.mocha.colors.green.hex,
            fill: false,
          },
        ],
      },
      options: mochaAxisChartOptions<'line'>(),
    };
  });
}
