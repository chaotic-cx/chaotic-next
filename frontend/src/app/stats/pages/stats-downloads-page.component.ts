import { Component, inject } from '@angular/core';
import { Card } from '@openng/optimus-ui/card';
import { ChartDownloadsComponent } from '../../chart-downloads/chart-downloads.component';
import { ChartCountryOverTimeComponent } from '../../chart-country-over-time/chart-country-over-time.component';
import { ChartMirrorOverTimeComponent } from '../../chart-mirror-over-time/chart-mirror-over-time.component';
import { StatsService } from '../stats.service';

@Component({
  selector: 'chaotic-stats-downloads-page',
  imports: [Card, ChartDownloadsComponent, ChartMirrorOverTimeComponent, ChartCountryOverTimeComponent],
  styleUrl: './stats-chart-page.css',
  template: `
    <div class="flex flex-col gap-8">
      <p-card [style]="{ overflow: 'hidden' }" header="Downloads by Package">
        <chaotic-chart-downloads [(range)]="statsService.globalPackageMetricRange" />
      </p-card>

      <p-card [style]="{ overflow: 'hidden' }" header="Mirror Popularity Over Time">
        <chaotic-chart-mirror-over-time />
      </p-card>

      <p-card [style]="{ overflow: 'hidden' }" header="Top Countries Over Time">
        <chaotic-chart-country-over-time />
      </p-card>
    </div>
  `,
})
export class StatsDownloadsPageComponent {
  protected readonly statsService = inject(StatsService);
}
