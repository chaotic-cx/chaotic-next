import { Component } from '@angular/core';
import { Card } from '@openng/optimus-ui/card';
import { ChartReviewStatsComponent } from '../../chart-review-stats/chart-review-stats.component';

@Component({
  selector: 'chaotic-stats-update-review-page',
  imports: [Card, ChartReviewStatsComponent],
  styleUrl: './stats-chart-page.css',
  template: `
    <p-card [style]="{ overflow: 'hidden' }" header="Update Reviews">
      <chaotic-chart-review-stats />
    </p-card>
  `,
})
export class StatsUpdateReviewPageComponent {}
