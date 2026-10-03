import { Component } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { Card } from '@openng/optimus-ui/card';
import { ChartArchOverlapComponent } from '../charts/builds/chart-arch-overlap/chart-arch-overlap.component';
import { ChartAverageBuildTimeTrendComponent } from '../charts/builds/chart-average-build-time-trend/chart-average-build-time-trend.component';
import { ChartBuildFailuresOverTimeComponent } from '../charts/builds/chart-build-failures-over-time/chart-build-failures-over-time.component';
import { ChartBuilderUtilizationComponent } from '../charts/builds/chart-builder-utilization/chart-builder-utilization.component';
import { ChartFailedHotspotsComponent } from '../charts/builds/chart-failed-hotspots/chart-failed-hotspots.component';
import { ChartFlakyPackagesComponent } from '../charts/builds/chart-flaky-packages/chart-flaky-packages.component';
import { ChartMissingDependenciesComponent } from '../charts/builds/chart-missing-dependencies/chart-missing-dependencies.component';
import { ChartThroughputComponent } from '../charts/builds/chart-throughput/chart-throughput.component';
import { ChartUnresolvedFailuresComponent } from '../charts/builds/chart-unresolved-failures/chart-unresolved-failures.component';

@Component({
  selector: 'chaotic-stats-insights-page',
  imports: [
    TranslocoDirective,
    Card,
    ChartAverageBuildTimeTrendComponent,
    ChartBuilderUtilizationComponent,
    ChartBuildFailuresOverTimeComponent,
    ChartArchOverlapComponent,
    ChartFailedHotspotsComponent,
    ChartFlakyPackagesComponent,
    ChartMissingDependenciesComponent,
    ChartThroughputComponent,
    ChartUnresolvedFailuresComponent,
  ],
  template: `
    <div class="grid h-full grid-cols-1 gap-8 lg:grid-cols-2" *transloco="let t; prefix: 'stats.pages.insights'">
      <p-card [style]="{ overflow: 'hidden' }" [header]="t('averageBuildTimeTrend')">
        @defer (on viewport; prefetch on idle) {
          <chaotic-chart-average-build-time-trend />
        } @placeholder {
          <div class="chaotic-chart-placeholder" aria-hidden="true"></div>
        }
      </p-card>
      <p-card [style]="{ overflow: 'hidden' }" [header]="t('throughput')">
        @defer (on viewport; prefetch on idle) {
          <chaotic-chart-throughput />
        } @placeholder {
          <div class="chaotic-chart-placeholder" aria-hidden="true"></div>
        }
      </p-card>
      <p-card [style]="{ overflow: 'hidden' }" [header]="t('failedHotspots')">
        @defer (on viewport; prefetch on idle) {
          <chaotic-chart-failed-hotspots />
        } @placeholder {
          <div class="chaotic-chart-placeholder" aria-hidden="true"></div>
        }
      </p-card>
      <p-card [style]="{ overflow: 'hidden' }" [header]="t('unresolvedFailures')">
        @defer (on viewport; prefetch on idle) {
          <chaotic-chart-unresolved-failures />
        } @placeholder {
          <div class="chaotic-chart-placeholder" aria-hidden="true"></div>
        }
      </p-card>
      <p-card [style]="{ overflow: 'hidden' }" [header]="t('missingDependencies')">
        @defer (on viewport; prefetch on idle) {
          <chaotic-chart-missing-dependencies />
        } @placeholder {
          <div class="chaotic-chart-placeholder" aria-hidden="true"></div>
        }
      </p-card>
      <p-card [style]="{ overflow: 'hidden' }" [header]="t('archOverlap')">
        @defer (on viewport; prefetch on idle) {
          <chaotic-chart-arch-overlap />
        } @placeholder {
          <div class="chaotic-chart-placeholder" aria-hidden="true"></div>
        }
      </p-card>
      <p-card [style]="{ overflow: 'hidden' }" [header]="t('buildFailuresOverTime')" styleClass="lg:col-span-2">
        @defer (on viewport; prefetch on idle) {
          <chaotic-chart-build-failures-over-time />
        } @placeholder {
          <div class="chaotic-chart-placeholder" aria-hidden="true"></div>
        }
      </p-card>
      <p-card [style]="{ overflow: 'hidden' }" [header]="t('flakyPackages')" styleClass="lg:col-span-2">
        @defer (on viewport; prefetch on idle) {
          <chaotic-chart-flaky-packages />
        } @placeholder {
          <div class="chaotic-chart-placeholder" aria-hidden="true"></div>
        }
      </p-card>
      <p-card [style]="{ overflow: 'hidden' }" [header]="t('builderUtilization')" styleClass="lg:col-span-2">
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
