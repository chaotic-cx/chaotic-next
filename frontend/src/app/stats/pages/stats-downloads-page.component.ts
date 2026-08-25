import { Component, inject } from '@angular/core';
import { Card } from '@openng/optimus-ui/card';
import { ChartDownloadsComponent } from '../../chart-downloads/chart-downloads.component';
import { ChartDownloadersTrendComponent } from '../../chart-downloaders-trend/chart-downloaders-trend.component';
import { ChartCountryOverTimeComponent } from '../../chart-country-over-time/chart-country-over-time.component';
import { ChartMirrorOverTimeComponent } from '../../chart-mirror-over-time/chart-mirror-over-time.component';
import { StatsService } from '../stats.service';

@Component({
  selector: 'chaotic-stats-downloads-page',
  imports: [
    Card,
    ChartDownloadsComponent,
    ChartDownloadersTrendComponent,
    ChartMirrorOverTimeComponent,
    ChartCountryOverTimeComponent,
  ],
  styleUrl: './stats-chart-page.css',
  template: `
    <div class="flex flex-col gap-8">
      <p-card [style]="{ overflow: 'hidden' }" header="Downloads by Package">
        @defer (on viewport; prefetch on idle) {
          <chaotic-chart-downloads [(range)]="statsService.globalPackageMetricRange" />
        } @placeholder {
          <div class="chaotic-chart-placeholder" aria-hidden="true"></div>
        }
      </p-card>

      <p-card [style]="{ overflow: 'hidden' }" header="Top Downloaders Over Time">
        @defer (on viewport; prefetch on idle) {
          <chaotic-chart-downloaders-trend />
        } @placeholder {
          <div class="chaotic-chart-placeholder" aria-hidden="true"></div>
        }
      </p-card>

      <p-card [style]="{ overflow: 'hidden' }" header="Mirror Popularity Over Time">
        @defer (on viewport; prefetch on idle) {
          <chaotic-chart-mirror-over-time />
        } @placeholder {
          <div class="chaotic-chart-placeholder" aria-hidden="true"></div>
        }
      </p-card>

      <p-card [style]="{ overflow: 'hidden' }" header="Top Countries Over Time">
        @defer (on viewport; prefetch on idle) {
          <chaotic-chart-country-over-time />
        } @placeholder {
          <div class="chaotic-chart-placeholder" aria-hidden="true"></div>
        }
      </p-card>
    </div>
  `,
})
export class StatsDownloadsPageComponent {
  protected readonly statsService = inject(StatsService);
}
