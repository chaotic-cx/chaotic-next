import { Component, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { Card } from '@openng/optimus-ui/card';
import { ChartDownloadsComponent } from '../charts/downloads/chart-downloads/chart-downloads.component';
import { ChartDownloadersTrendComponent } from '../charts/downloads/chart-downloaders-trend/chart-downloaders-trend.component';
import { ChartCountryOverTimeComponent } from '../charts/downloads/chart-country-over-time/chart-country-over-time.component';
import { ChartMirrorOverTimeComponent } from '../charts/downloads/chart-mirror-over-time/chart-mirror-over-time.component';
import { StatsService } from '../stats.service';

@Component({
  selector: 'chaotic-stats-downloads-page',
  imports: [
    TranslocoDirective,
    Card,
    ChartDownloadsComponent,
    ChartDownloadersTrendComponent,
    ChartMirrorOverTimeComponent,
    ChartCountryOverTimeComponent,
  ],
  styleUrl: './stats-chart-page.css',
  template: `
    <div class="flex flex-col gap-8" *transloco="let t; prefix: 'stats.pages.downloads'">
      <p-card [style]="{ overflow: 'hidden' }" [header]="t('downloads')">
        @defer (on viewport; prefetch on idle) {
          <chaotic-chart-downloads [(range)]="statsService.globalPackageMetricRange" />
        } @placeholder {
          <div class="chaotic-chart-placeholder" aria-hidden="true"></div>
        }
      </p-card>

      <p-card [style]="{ overflow: 'hidden' }" [header]="t('downloadersTrend')">
        @defer (on viewport; prefetch on idle) {
          <chaotic-chart-downloaders-trend />
        } @placeholder {
          <div class="chaotic-chart-placeholder" aria-hidden="true"></div>
        }
      </p-card>

      <p-card [style]="{ overflow: 'hidden' }" [header]="t('mirrorOverTime')">
        @defer (on viewport; prefetch on idle) {
          <chaotic-chart-mirror-over-time />
        } @placeholder {
          <div class="chaotic-chart-placeholder" aria-hidden="true"></div>
        }
      </p-card>

      <p-card [style]="{ overflow: 'hidden' }" [header]="t('countryOverTime')">
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
