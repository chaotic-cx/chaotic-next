import { Component } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { Card } from '@openng/optimus-ui/card';
import { ChartCountriesComponent } from '../charts/downloads/chart-countries/chart-countries.component';
import { ChartRpsHistoryComponent } from '../charts/system/chart-rps-history/chart-rps-history.component';
import { ChartUseragentComponent } from '../charts/system/chart-useragent/chart-useragent.component';

@Component({
  selector: 'chaotic-stats-globals-page',
  imports: [TranslocoDirective, Card, ChartCountriesComponent, ChartUseragentComponent, ChartRpsHistoryComponent],
  template: `
    <div class="grid grid-cols-1 gap-8 xl:grid-cols-2" *transloco="let t; prefix: 'stats.pages.globals'">
      <p-card [style]="{ overflow: 'hidden' }" [header]="t('countries')">
        @defer (on viewport; prefetch on idle) {
          <chaotic-chart-countries />
        } @placeholder {
          <div class="chaotic-chart-placeholder" aria-hidden="true"></div>
        }
      </p-card>
      <p-card [style]="{ overflow: 'hidden' }" [header]="t('userAgents')">
        @defer (on viewport; prefetch on idle) {
          <chaotic-chart-useragent />
        } @placeholder {
          <div class="chaotic-chart-placeholder" aria-hidden="true"></div>
        }
      </p-card>
      <p-card class="xl:col-span-2" [style]="{ overflow: 'hidden' }" [header]="t('rpsHistory')">
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
