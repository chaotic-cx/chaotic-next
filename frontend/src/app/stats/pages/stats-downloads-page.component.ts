import { Component, inject } from '@angular/core';
import { Card } from '@openng/optimus-ui/card';
import { ChartDownloadsComponent } from '../../chart-downloads/chart-downloads.component';
import { StatsService } from '../stats.service';

@Component({
  selector: 'chaotic-stats-downloads-page',
  imports: [Card, ChartDownloadsComponent],
  styleUrl: './stats-chart-page.css',
  template: `
    <p-card [style]="{ overflow: 'hidden' }" header="Downloads">
      <chaotic-chart-downloads [(range)]="statsService.globalPackageMetricRange" />
    </p-card>
  `,
})
export class StatsDownloadsPageComponent {
  protected readonly statsService = inject(StatsService);
}
