import { Component } from '@angular/core';
import { ChartReviewStatsComponent } from '../../chart-review-stats/chart-review-stats.component';

@Component({
  selector: 'chaotic-stats-update-review-page',
  imports: [ChartReviewStatsComponent],
  template: '<chaotic-chart-review-stats />',
})
export class StatsUpdateReviewPageComponent {}
