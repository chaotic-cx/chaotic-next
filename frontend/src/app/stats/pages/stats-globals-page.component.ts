import { Component } from '@angular/core';
import { Card } from '@openng/optimus-ui/card';
import { ChartCountriesComponent } from '../../chart-countries/chart-countries.component';
import { ChartRpsHistoryComponent } from '../../chart-rps-history/chart-rps-history.component';
import { ChartUseragentComponent } from '../../chart-useragent/chart-useragent.component';

@Component({
  selector: 'chaotic-stats-globals-page',
  imports: [Card, ChartCountriesComponent, ChartUseragentComponent, ChartRpsHistoryComponent],
  template: `
    <div class="grid grid-cols-1 gap-8 xl:grid-cols-2">
      <p-card [style]="{ overflow: 'hidden' }" header="Country list">
        @defer (on viewport; prefetch on idle) {
          <chaotic-chart-countries />
        } @placeholder {
          <div class="chaotic-chart-placeholder" aria-hidden="true"></div>
        }
      </p-card>
      <p-card [style]="{ overflow: 'hidden' }" header="User agents">
        @defer (on viewport; prefetch on idle) {
          <chaotic-chart-useragent />
        } @placeholder {
          <div class="chaotic-chart-placeholder" aria-hidden="true"></div>
        }
      </p-card>
      <p-card class="xl:col-span-2" [style]="{ overflow: 'hidden' }" header="RPS over last hour">
        @defer (on viewport; prefetch on idle) {
          <chaotic-chart-rps-history />
        } @placeholder {
          <div class="chaotic-chart-placeholder" aria-hidden="true"></div>
        }
      </p-card>
    </div>
  `,
  styleUrl: './stats-chart-page.css',
})
export class StatsGlobalsPageComponent {}
