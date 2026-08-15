import { Component, inject } from '@angular/core';
import { ChartDownloadsComponent } from '../../chart-downloads/chart-downloads.component';
import { StatsService } from '../stats.service';

@Component({
  selector: 'chaotic-stats-downloads-page',
  imports: [ChartDownloadsComponent],
  template: '<chaotic-chart-downloads [(range)]="statsService.globalPackageMetricRange" />',
})
export class StatsDownloadsPageComponent {
  protected readonly statsService = inject(StatsService);
}
