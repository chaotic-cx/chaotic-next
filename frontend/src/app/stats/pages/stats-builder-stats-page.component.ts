import { Component } from '@angular/core';
import { Card } from '@openng/optimus-ui/card';
import { ChartAverageBuildTimeComponent } from '../../chart-average-build-time/chart-average-build-time.component';
import { ChartBuildersAmountComponent } from '../../chart-builders-amount/chart-builders-amount.component';
import { ChartBuildsPerDayComponent } from '../../chart-builds-per-day/chart-builds-per-day.component';
import { ChartHeavyPackagesComponent } from '../../chart-heavy-packages/chart-heavy-packages.component';
import { ChartPackagesPerBuildClassComponent } from '../../chart-packages-per-build-class/chart-packages-per-build-class.component';
import { ChartPkgbaseCompositionComponent } from '../../chart-pkgbase-composition/chart-pkgbase-composition.component';
import { ChartPopularPackagesComponent } from '../../chart-popular-packages/chart-popular-packages.component';

@Component({
  selector: 'chaotic-stats-builder-stats-page',
  imports: [
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
    <div class="flex flex-col gap-8">
      <div class="grid grid-cols-1 gap-8 xl:grid-cols-2">
        <p-card [style]="{ overflow: 'hidden' }" header="Average Build Time per Status">
          <chaotic-chart-average-build-time />
        </p-card>
        <p-card [style]="{ overflow: 'hidden' }" header="Builds per Builder">
          <chaotic-chart-builders-amount />
        </p-card>
      </div>
      <p-card [style]="{ overflow: 'hidden' }" header="Builds per Day">
        <chaotic-chart-builds-per-day />
      </p-card>
      <p-card [style]="{ overflow: 'hidden' }" header="Popular Packages">
        <chaotic-chart-popular-packages />
      </p-card>
      <p-card [style]="{ overflow: 'hidden' }" header="Heavy Packages">
        <chaotic-chart-heavy-packages />
      </p-card>
      <div class="grid grid-cols-1 gap-8 xl:grid-cols-2">
        <p-card [style]="{ overflow: 'hidden' }" header="Packages per Build Class">
          <chaotic-chart-packages-per-build-class />
        </p-card>
        <p-card [style]="{ overflow: 'hidden' }" header="Single vs Split Packages">
          <chaotic-chart-pkgbase-composition />
        </p-card>
      </div>
    </div>
  `,
  styleUrl: './stats-chart-page.css',
})
export class StatsBuilderStatsPageComponent {}
