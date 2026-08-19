import { Component } from '@angular/core';
import { Card } from '@openng/optimus-ui/card';
import { ChartAverageBuildTimeTrendComponent } from '../../chart-average-build-time-trend/chart-average-build-time-trend.component';
import { ChartDownloadersTrendComponent } from '../../chart-downloaders-trend/chart-downloaders-trend.component';
import { ChartFailedHotspotsComponent } from '../../chart-failed-hotspots/chart-failed-hotspots.component';
import { ChartThroughputComponent } from '../../chart-throughput/chart-throughput.component';

@Component({
  selector: 'chaotic-stats-insights-page',
  imports: [
    Card,
    ChartAverageBuildTimeTrendComponent,
    ChartFailedHotspotsComponent,
    ChartThroughputComponent,
    ChartDownloadersTrendComponent,
  ],
  template: `
    <div class="grid h-full grid-cols-1 gap-8 lg:grid-cols-2">
      <p-card [style]="{ overflow: 'hidden' }" header="Average build time">
        <chaotic-chart-average-build-time-trend />
      </p-card>
      <p-card [style]="{ overflow: 'hidden' }" header="Queue throughput">
        <chaotic-chart-throughput />
      </p-card>
      <p-card [style]="{ overflow: 'hidden' }" header="Top downloaders">
        <chaotic-chart-downloaders-trend />
      </p-card>
      <p-card [style]="{ overflow: 'hidden' }" header="Failed build hotspots">
        <chaotic-chart-failed-hotspots />
      </p-card>
    </div>
  `,
  styleUrl: './stats-chart-page.css',
})
export class StatsInsightsPageComponent {}
