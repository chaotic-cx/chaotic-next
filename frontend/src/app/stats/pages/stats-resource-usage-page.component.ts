import { Component } from '@angular/core';
import { Card } from '@openng/optimus-ui/card';
import { ChartHeavyPackagesResourceComponent } from '../../chart-heavy-packages-resource/chart-heavy-packages-resource.component';

@Component({
  selector: 'chaotic-stats-resource-usage-page',
  imports: [Card, ChartHeavyPackagesResourceComponent],
  template: `
    <div class="grid grid-cols-1 gap-8 xl:grid-cols-2">
      <p-card [style]="{ overflow: 'hidden' }" header="Memory">
        <chaotic-chart-heavy-packages-resource metric="memory" />
      </p-card>
      <p-card [style]="{ overflow: 'hidden' }" header="CPU Time">
        <chaotic-chart-heavy-packages-resource metric="cpu" />
      </p-card>
      <p-card [style]="{ overflow: 'hidden' }" header="Disk I/O">
        <chaotic-chart-heavy-packages-resource metric="disk" />
      </p-card>
      <p-card [style]="{ overflow: 'hidden' }" header="Network I/O">
        <chaotic-chart-heavy-packages-resource metric="network" />
      </p-card>
    </div>
  `,
  styleUrl: './stats-chart-page.css',
})
export class StatsResourceUsagePageComponent {}
