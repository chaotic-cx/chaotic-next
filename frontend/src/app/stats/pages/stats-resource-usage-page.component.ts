import { Component } from '@angular/core';
import { Card } from '@openng/optimus-ui/card';
import { ChartHeavyPackagesResourceComponent } from '../charts/builds/chart-heavy-packages-resource/chart-heavy-packages-resource.component';

@Component({
  selector: 'chaotic-stats-resource-usage-page',
  imports: [Card, ChartHeavyPackagesResourceComponent],
  template: `
    <div class="grid grid-cols-1 gap-8 xl:grid-cols-2">
      <p-card [style]="{ overflow: 'hidden' }" header="Memory">
        @defer (on viewport; prefetch on idle) {
          <chaotic-chart-heavy-packages-resource metric="memory" />
        } @placeholder {
          <div class="chaotic-chart-placeholder" aria-hidden="true"></div>
        }
      </p-card>
      <p-card [style]="{ overflow: 'hidden' }" header="CPU Time">
        @defer (on viewport; prefetch on idle) {
          <chaotic-chart-heavy-packages-resource metric="cpu" />
        } @placeholder {
          <div class="chaotic-chart-placeholder" aria-hidden="true"></div>
        }
      </p-card>
      <p-card [style]="{ overflow: 'hidden' }" header="Disk I/O">
        @defer (on viewport; prefetch on idle) {
          <chaotic-chart-heavy-packages-resource metric="disk" />
        } @placeholder {
          <div class="chaotic-chart-placeholder" aria-hidden="true"></div>
        }
      </p-card>
      <p-card [style]="{ overflow: 'hidden' }" header="Network I/O">
        @defer (on viewport; prefetch on idle) {
          <chaotic-chart-heavy-packages-resource metric="network" />
        } @placeholder {
          <div class="chaotic-chart-placeholder" aria-hidden="true"></div>
        }
      </p-card>
    </div>
  `,
  styleUrl: './stats-chart-page.css',
})
export class StatsResourceUsagePageComponent {}
