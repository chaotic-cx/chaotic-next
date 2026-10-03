import { Component, computed, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { AppService } from '../../../../app.service';
import { injectActiveTranslation } from '../../../../i18n/active-translation';
import { seriesColors } from '../../../../theme';
import { StatsService } from '../../../stats.service';
import { ChartCardComponent } from '../../chart-card/chart-card.component';
import { chartResource, type ChartConfig, pieChartOptions } from '../../chart-config';

@Component({
  selector: 'chaotic-chart-review-stats',
  imports: [ChartCardComponent],
  templateUrl: './chart-review-stats.component.html',
  styleUrl: './chart-review-stats.component.css',
})
export class ChartReviewStatsComponent {
  private readonly appService = inject(AppService);
  private readonly statsService = inject(StatsService);
  private readonly transloco = inject(TranslocoService);

  private readonly activeTranslation = injectActiveTranslation();

  readonly chart = chartResource<{ username: string; reviews: number }[]>(() =>
    this.appService.getUpdateReviewStatsResourceRequest(this.statsService.timeRangeDays() ?? undefined),
  );

  readonly chartConfig = computed<ChartConfig<'pie'>>(() => {
    this.activeTranslation();

    const reviewStats = this.chart
      .data()
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
            label: this.transloco.translate('stats.charts.reviewStats.label'),
            backgroundColor: seriesColors(),
          },
        ],
      },
      options: pieChartOptions(),
    };
  });
}
