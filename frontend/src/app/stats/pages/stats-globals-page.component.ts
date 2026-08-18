import { Component } from '@angular/core';
import { Card } from '@openng/optimus-ui/card';
import { ChartCountriesComponent } from '../../chart-countries/chart-countries.component';
import { ChartUseragentComponent } from '../../chart-useragent/chart-useragent.component';

@Component({
  selector: 'chaotic-stats-globals-page',
  imports: [Card, ChartCountriesComponent, ChartUseragentComponent],
  template: `
    <div class="flex h-full flex-col gap-8">
      <p-card [style]="{ overflow: 'hidden' }" header="Country list">
        <chaotic-chart-countries />
      </p-card>
      <p-card [style]="{ overflow: 'hidden' }" header="User agents">
        <chaotic-chart-useragent />
      </p-card>
    </div>
  `,
  styleUrl: './stats-chart-page.css',
})
export class StatsGlobalsPageComponent {}
