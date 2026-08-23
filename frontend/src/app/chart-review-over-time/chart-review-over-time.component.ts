import { httpResource } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import { UIChart } from '@openng/optimus-ui/chart';
import { AppService } from '../app.service';
import { type ChartConfig, mochaAxisChartOptions } from '../chart-config';
import { resourceValue } from '../functions';
import { StatsService } from '../stats/stats.service';
import { CATPPUCCIN_FLAVOURS } from '../theme';

const BOT_USERNAME = 'temeraire-cx';
const SERVICE_ACCOUNT_PREFIXES = ['gitlab_', 'project_'];

function isVisibleReviewer(username: string): boolean {
  return username !== BOT_USERNAME && !SERVICE_ACCOUNT_PREFIXES.some((prefix) => username.startsWith(prefix));
}

@Component({
  selector: 'chaotic-chart-review-over-time',
  imports: [UIChart],
  templateUrl: './chart-review-over-time.component.html',
  styleUrl: './chart-review-over-time.component.css',
})
export class ChartReviewOverTimeComponent {
  private readonly appService = inject(AppService);
  private readonly statsService = inject(StatsService);

  private readonly resource = httpResource<{ date: string; username: string; reviews: number }[]>(() =>
    this.appService.getUpdateReviewStatsOverTimeResourceRequest(this.statsService.timeRangeDays() ?? undefined),
  );

  readonly loading = this.resource.isLoading;

  readonly hasData = computed(() => this.resource.hasValue());

  readonly chartConfig = computed<ChartConfig<'line'>>(() => {
    const data = (resourceValue(this.resource) ?? []).filter((row) => isVisibleReviewer(row.username));
    const dates = Array.from(new Set(data.map((row) => row.date))).sort();
    const usernames = Array.from(new Set(data.map((row) => row.username)));

    const reviewsByCell = new Map<string, number>();
    for (const row of data) reviewsByCell.set(`${row.date}\u0000${row.username}`, row.reviews);

    const datasets = usernames.map((username, index) => {
      const color = CATPPUCCIN_FLAVOURS[index % CATPPUCCIN_FLAVOURS.length];
      return {
        label: username,
        data: dates.map((date) => reviewsByCell.get(`${date}\u0000${username}`) ?? 0),
        borderColor: color,
        backgroundColor: color,
        tension: 0.4,
      };
    });

    return {
      data: {
        labels: dates,
        datasets,
      },
      options: {
        ...mochaAxisChartOptions<'line'>({ indexAxis: 'x' }),
        aspectRatio: 2,
      },
    };
  });
}
