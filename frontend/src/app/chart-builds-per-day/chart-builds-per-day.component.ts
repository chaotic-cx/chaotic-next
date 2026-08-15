import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import { flavors } from '@catppuccin/palette';
import { UIChart } from '@openng/optimus-ui/chart';
import { AppService } from '../app.service';
import { type ChartConfig, mochaLegendLabels, mochaScales } from '../chart-config';
import { parseCount } from '../functions';
import { StatsService } from '../stats/stats.service';

@Component({
  selector: 'chaotic-chart-builds-per-day',
  imports: [UIChart],
  templateUrl: './chart-builds-per-day.component.html',
  styleUrl: './chart-builds-per-day.component.css',
  providers: [DatePipe],
})
export class ChartBuildsPerDayComponent {
  private readonly appService = inject(AppService);
  private readonly datePipe = inject(DatePipe);
  private readonly statsService = inject(StatsService);

  private readonly resource = httpResource<{ day: string; count: string }[]>(() =>
    this.appService.getBuildsPerDayResourceRequest(this.statsService.timeRangeDays() ?? 3650),
  );

  readonly loading = this.resource.isLoading;

  readonly hasData = computed(() => this.resource.hasValue());

  readonly chartConfig = computed<ChartConfig<'line'>>(() => {
    const data = this.resource.value() ?? [];
    const labels: string[] = [];
    const values: number[] = [];
    for (const item of data) {
      const formattedDate = this.datePipe.transform(item.day, 'shortDate');
      labels.push(formattedDate || item.day);
      values.push(parseCount(item.count));
    }

    return {
      data: {
        labels,
        datasets: [
          {
            label: 'Builds per day',
            data: values,
            backgroundColor: flavors.mocha.colors.lavender.hex,
            borderColor: flavors.mocha.colors.lavender.hex,
            fill: false,
          },
        ],
      },
      options: {
        maintainAspectRatio: false,
        aspectRatio: 0.4,
        plugins: {
          legend: { labels: mochaLegendLabels() },
        },
        scales: mochaScales(),
      },
    };
  });
}
