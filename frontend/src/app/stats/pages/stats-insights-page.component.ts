import { Component } from '@angular/core';
import { Card } from '@openng/optimus-ui/card';
import { ChartAverageBuildTimeTrendComponent } from '../../chart-average-build-time-trend/chart-average-build-time-trend.component';
import { ChartBuilderUtilizationComponent } from '../../chart-builder-utilization/chart-builder-utilization.component';
import { ChartBuildFailuresOverTimeComponent } from '../../chart-build-failures-over-time/chart-build-failures-over-time.component';
import { ChartFailedHotspotsComponent } from '../../chart-failed-hotspots/chart-failed-hotspots.component';
import { ChartFlakyPackagesComponent } from '../../chart-flaky-packages/chart-flaky-packages.component';
import { ChartThroughputComponent } from '../../chart-throughput/chart-throughput.component';
import { ChartUnresolvedFailuresComponent } from '../../chart-unresolved-failures/chart-unresolved-failures.component';

@Component({
  selector: 'chaotic-stats-insights-page',
  imports: [
    Card,
    ChartAverageBuildTimeTrendComponent,
    ChartBuilderUtilizationComponent,
    ChartBuildFailuresOverTimeComponent,
    ChartFailedHotspotsComponent,
    ChartFlakyPackagesComponent,
    ChartThroughputComponent,
    ChartUnresolvedFailuresComponent,
  ],
  template: `
    <div class="grid h-full grid-cols-1 gap-8 lg:grid-cols-2">
      <p-card [style]="{ overflow: 'hidden' }" header="Average build time (minutes)">
        @defer (on viewport; prefetch on idle) {
          <chaotic-chart-average-build-time-trend />
        } @placeholder {
          <div class="chaotic-chart-placeholder" aria-hidden="true"></div>
        }
      </p-card>
      <p-card [style]="{ overflow: 'hidden' }" header="Queue throughput">
        @defer (on viewport; prefetch on idle) {
          <chaotic-chart-throughput />
        } @placeholder {
          <div class="chaotic-chart-placeholder" aria-hidden="true"></div>
        }
      </p-card>
      <p-card [style]="{ overflow: 'hidden' }" header="Failed build hotspots">
        @defer (on viewport; prefetch on idle) {
          <chaotic-chart-failed-hotspots />
        } @placeholder {
          <div class="chaotic-chart-placeholder" aria-hidden="true"></div>
        }
      </p-card>
      <p-card [style]="{ overflow: 'hidden' }" header="Failed builds with no more recent success">
        @defer (on viewport; prefetch on idle) {
          <chaotic-chart-unresolved-failures />
        } @placeholder {
          <div class="chaotic-chart-placeholder" aria-hidden="true"></div>
        }
      </p-card>
      <p-card [style]="{ overflow: 'hidden' }" header="Build failures over time" styleClass="lg:col-span-2">
        @defer (on viewport; prefetch on idle) {
          <chaotic-chart-build-failures-over-time />
        } @placeholder {
          <div class="chaotic-chart-placeholder" aria-hidden="true"></div>
        }
      </p-card>
      <p-card [style]="{ overflow: 'hidden' }" header="Flakiest packages" styleClass="lg:col-span-2">
        @defer (on viewport; prefetch on idle) {
          <chaotic-chart-flaky-packages />
        } @placeholder {
          <div class="chaotic-chart-placeholder" aria-hidden="true"></div>
        }
      </p-card>
      <p-card [style]="{ overflow: 'hidden' }" header="Builder utilization" styleClass="lg:col-span-2">
        @defer (on viewport; prefetch on idle) {
          <chaotic-chart-builder-utilization />
        } @placeholder {
          <div class="chaotic-chart-placeholder" aria-hidden="true"></div>
        }
      </p-card>
    </div>
  `,
  styleUrl: './stats-chart-page.css',
})
export class StatsInsightsPageComponent {}
