import { Component } from '@angular/core';
import { Card } from '@openng/optimus-ui/card';
import { ChartReviewOverTimeComponent } from '../../chart-review-over-time/chart-review-over-time.component';
import { ChartReviewStatsComponent } from '../../chart-review-stats/chart-review-stats.component';

@Component({
  selector: 'chaotic-stats-update-review-page',
  imports: [Card, ChartReviewStatsComponent, ChartReviewOverTimeComponent],
  styleUrl: './stats-chart-page.css',
  template: `
    <div class="flex flex-col gap-4">
      <p-card [style]="{ overflow: 'hidden' }" header="Total Update Reviews">
        @defer (on viewport; prefetch on idle) {
          <chaotic-chart-review-stats />
        } @placeholder {
          <div class="chaotic-chart-placeholder" aria-hidden="true"></div>
        }
      </p-card>

      <p-card [style]="{ overflow: 'hidden' }" header="Update Reviews Over Time">
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
