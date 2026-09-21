import { Component } from '@angular/core';
import { Card } from '@openng/optimus-ui/card';
import { ChartAdditionsComponent } from '../charts/builds/chart-additions/chart-additions.component';
import { ChartRemovalsComponent } from '../charts/builds/chart-removals/chart-removals.component';
import { ChartTopAurScansComponent } from '../charts/builds/chart-top-aur-scans/chart-top-aur-scans.component';

@Component({
  selector: 'chaotic-stats-additions-page',
  imports: [Card, ChartAdditionsComponent, ChartRemovalsComponent, ChartTopAurScansComponent],
  template: `
    <div class="flex h-full flex-col gap-8">
      <p-card [style]="{ overflow: 'hidden' }" header="Packages added over time">
        @defer (on viewport; prefetch on idle) {
          <chaotic-chart-additions />
        } @placeholder {
          <div class="chaotic-chart-placeholder" aria-hidden="true"></div>
        }
      </p-card>
      <p-card [style]="{ overflow: 'hidden' }" header="Packages dropped over time">
        @defer (on viewport; prefetch on idle) {
          <chaotic-chart-removals />
        } @placeholder {
          <div class="chaotic-chart-placeholder" aria-hidden="true"></div>
        }
      </p-card>
      <p-card [style]="{ overflow: 'hidden' }" header="Most scanned packages via AUR scanner">
        @defer (on viewport; prefetch on idle) {
          <chaotic-chart-top-aur-scans />
        } @placeholder {
          <div class="chaotic-chart-placeholder" aria-hidden="true"></div>
        }
      </p-card>
    </div>
  `,
  styleUrl: './stats-chart-page.css',
})
export class StatsAdditionsPageComponent {}
