import { Component } from '@angular/core';
import { Card } from '@openng/optimus-ui/card';
import { ChartAdditionsComponent } from '../../chart-additions/chart-additions.component';

@Component({
  selector: 'chaotic-stats-additions-page',
  imports: [Card, ChartAdditionsComponent],
  template: `
    <div class="flex h-full flex-col gap-8">
      <p-card [style]="{ overflow: 'hidden' }" header="Packages added over time">
        @defer (on viewport; prefetch on idle) {
          <chaotic-chart-additions />
        } @placeholder {
          <div class="chaotic-chart-placeholder" aria-hidden="true"></div>
        }
      </p-card>
    </div>
  `,
  styleUrl: './stats-chart-page.css',
})
export class StatsAdditionsPageComponent {}
