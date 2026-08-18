import { httpResource } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import { UIChart } from '@openng/optimus-ui/chart';
import { AppService } from '../app.service';
import { type ChartConfig, mochaLegendLabels } from '../chart-config';
import { resourceValue, shuffleArray } from '../functions';
import { CATPPUCCIN_FLAVOURS } from '../theme';

@Component({
  selector: 'chaotic-chart-review-stats',
  imports: [UIChart],
  templateUrl: './chart-review-stats.component.html',
  styleUrl: './chart-review-stats.component.css',
})
export class ChartReviewStatsComponent {
  private readonly appService = inject(AppService);

  private readonly resource = httpResource<{ username: string; reviews: number }[]>(() =>
    this.appService.getUpdateReviewStatsResourceRequest(),
  );

  readonly loading = this.resource.isLoading;

  readonly hasData = computed(() => this.resource.hasValue());

  readonly chartConfig = computed<ChartConfig<'pie'>>(() => {
    const reviewStats = (resourceValue(this.resource) ?? [])
      .sort((a, b) => b.reviews - a.reviews)
      .filter((entry) => !entry.username.startsWith('gitlab_') && !entry.username.startsWith('project_'))
      .filter((e) => e.reviews > 0 && e.username !== 'temeraire-cx');

    const labels: string[] = [];
    const data: number[] = [];
    for (const stat of reviewStats) {
      labels.push(stat.username);
      data.push(stat.reviews);
    }

    return {
      data: {
        labels,
        datasets: [
          {
            data,
            label: 'Reviews',
            backgroundColor: shuffleArray(CATPPUCCIN_FLAVOURS),
          },
        ],
      },
      options: {
        plugins: {
          legend: { labels: mochaLegendLabels(), position: 'top' },
        },
      },
    };
  });
}
