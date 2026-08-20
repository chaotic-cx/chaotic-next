import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import { UIChart } from '@openng/optimus-ui/chart';
import { ALL_TIME_DAYS, AppService } from '../app.service';
import { type ChartConfig, groupOverTimeChart, mochaAxisChartOptions } from '../chart-config';
import { resourceValue } from '../functions';
import { StatsService } from '../stats/stats.service';

interface CountryRow {
  day: string;
  country: string;
  count: string;
}

@Component({
  selector: 'chaotic-chart-country-over-time',
  imports: [UIChart],
  templateUrl: './chart-country-over-time.component.html',
  styleUrl: './chart-country-over-time.component.css',
  providers: [DatePipe],
})
export class ChartCountryOverTimeComponent {
  private readonly appService = inject(AppService);
  private readonly datePipe = inject(DatePipe);
  private readonly statsService = inject(StatsService);

  private readonly resource = httpResource<CountryRow[]>(() =>
    this.appService.getCountryStatsOverTimeResourceRequest(this.statsService.timeRangeDays() ?? ALL_TIME_DAYS),
  );

  readonly loading = this.resource.isLoading;
  readonly hasData = computed(() => this.resource.hasValue());

  readonly chartConfig = computed<ChartConfig<'line'>>(() => {
    const rows = (resourceValue(this.resource) ?? []).map((row) => ({
      day: row.day,
      group: row.country,
      count: row.count,
    }));
    const { labels, datasets } = groupOverTimeChart(rows, (day) => this.datePipe.transform(day, 'shortDate') || day);
    return {
      data: { labels, datasets },
      options: { ...mochaAxisChartOptions<'line'>(), aspectRatio: 2 },
    };
  });
}
