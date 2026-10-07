import { Component } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { Card } from '@openng/optimus-ui/card';
import { ChartAverageBuildTimeComponent } from '../charts/builds/chart-average-build-time/chart-average-build-time.component';
import { ChartBuildersAmountComponent } from '../charts/builds/chart-builders-amount/chart-builders-amount.component';
import { ChartBuildsPerDayComponent } from '../charts/builds/chart-builds-per-day/chart-builds-per-day.component';
import { ChartHeavyPackagesComponent } from '../charts/builds/chart-heavy-packages/chart-heavy-packages.component';
import { ChartPackagesPerBuildClassComponent } from '../charts/builds/chart-packages-per-build-class/chart-packages-per-build-class.component';
import { ChartPkgbaseCompositionComponent } from '../charts/builds/chart-pkgbase-composition/chart-pkgbase-composition.component';
import { ChartPopularPackagesComponent } from '../charts/builds/chart-popular-packages/chart-popular-packages.component';

@Component({
  selector: 'chaotic-stats-builder-stats-page',
  imports: [
    TranslocoDirective,
    Card,
    ChartBuildsPerDayComponent,
    ChartBuildersAmountComponent,
    ChartAverageBuildTimeComponent,
    ChartPopularPackagesComponent,
    ChartHeavyPackagesComponent,
    ChartPackagesPerBuildClassComponent,
    ChartPkgbaseCompositionComponent,
  ],
  template: `
    <div class="flex flex-col gap-8" *transloco="let t; prefix: 'stats.pages.builderStats'">
      <div class="grid grid-cols-1 gap-8 xl:grid-cols-2">
        <p-card [style]="{ overflow: 'hidden' }" [header]="t('averageBuildTime')">
          @defer (on viewport; prefetch on idle) {
            <chaotic-chart-average-build-time />
          } @placeholder {
            <div class="chaotic-chart-placeholder" aria-hidden="true"></div>
          }
        </p-card>
        <p-card [style]="{ overflow: 'hidden' }" [header]="t('buildersAmount')">
          @defer (on viewport; prefetch on idle) {
            <chaotic-chart-builders-amount />
          } @placeholder {
            <div class="chaotic-chart-placeholder" aria-hidden="true"></div>
          }
        </p-card>
      </div>
      <p-card [style]="{ overflow: 'hidden' }" [header]="t('buildsPerDay')">
        @defer (on viewport; prefetch on idle) {
          <chaotic-chart-builds-per-day />
        } @placeholder {
          <div class="chaotic-chart-placeholder" aria-hidden="true"></div>
        }
      </p-card>
      <p-card [style]="{ overflow: 'hidden' }" [header]="t('popularPackages')">
        @defer (on viewport; prefetch on idle) {
          <chaotic-chart-popular-packages />
        } @placeholder {
          <div class="chaotic-chart-placeholder" aria-hidden="true"></div>
        }
      </p-card>
      <p-card [style]="{ overflow: 'hidden' }" [header]="t('heavyPackages')">
        @defer (on viewport; prefetch on idle) {
          <chaotic-chart-heavy-packages />
        } @placeholder {
          <div class="chaotic-chart-placeholder" aria-hidden="true"></div>
        }
      </p-card>
      <div class="grid grid-cols-1 gap-8 xl:grid-cols-2">
        <p-card [style]="{ overflow: 'hidden' }" [header]="t('packagesPerBuildClass')">
          @defer (on viewport; prefetch on idle) {
            <chaotic-chart-packages-per-build-class />
          } @placeholder {
            <div class="chaotic-chart-placeholder" aria-hidden="true"></div>
          }
        </p-card>
        <p-card [style]="{ overflow: 'hidden' }" [header]="t('pkgbaseComposition')">
          @defer (on viewport; prefetch on idle) {
            <chaotic-chart-pkgbase-composition />
          } @placeholder {
            <div class="chaotic-chart-placeholder" aria-hidden="true"></div>
          }
        </p-card>
      </div>
    </div>
  `,
  styleUrl: './stats-chart-page.css',
})
export class StatsBuilderStatsPageComponent {}
