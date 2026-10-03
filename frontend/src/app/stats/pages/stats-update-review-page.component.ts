import { Component } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { Card } from '@openng/optimus-ui/card';
import { ChartReviewOverTimeComponent } from '../charts/reviews/chart-review-over-time/chart-review-over-time.component';
import { ChartReviewStatsComponent } from '../charts/reviews/chart-review-stats/chart-review-stats.component';

@Component({
  selector: 'chaotic-stats-update-review-page',
  imports: [TranslocoDirective, Card, ChartReviewStatsComponent, ChartReviewOverTimeComponent],
  styleUrl: './stats-chart-page.css',
  template: `
    <div class="flex flex-col gap-4" *transloco="let t; prefix: 'stats.pages.updateReview'">
      <p-card [style]="{ overflow: 'hidden' }" [header]="t('reviewStats')">
        @defer (on viewport; prefetch on idle) {
          <chaotic-chart-review-stats />
        } @placeholder {
          <div class="chaotic-chart-placeholder" aria-hidden="true"></div>
        }
      </p-card>

      <p-card [style]="{ overflow: 'hidden' }" [header]="t('reviewOverTime')">
        @defer (on viewport; prefetch on idle) {
          <chaotic-chart-review-over-time />
        } @placeholder {
          <div class="chaotic-chart-placeholder" aria-hidden="true"></div>
        }
      </p-card>
    </div>
  `,
})
export class StatsUpdateReviewPageComponent {}
