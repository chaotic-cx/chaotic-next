import { BreakpointObserver } from '@angular/cdk/layout';
import { httpResource } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { UIChart } from '@openng/optimus-ui/chart';
import { InputNumber } from '@openng/optimus-ui/inputnumber';
import { AppService } from '../app.service';
import { type ChartConfig, mochaPieChartOptions } from '../chart-config';
import { resourceValue, shuffleArray } from '../functions';
import { StatsService } from '../stats/stats.service';
import { CATPPUCCIN_FLAVOURS } from '../theme';

@Component({
  selector: 'chaotic-chart-useragent',
  imports: [InputNumber, UIChart, FormsModule],
  templateUrl: './chart-useragent.component.html',
  styleUrl: './chart-useragent.component.css',
})
export class ChartUseragentComponent {
  private readonly appService = inject(AppService);
  private readonly observer = inject(BreakpointObserver);
  protected readonly statsService = inject(StatsService);

  private readonly resource = httpResource<{ name: string; count: number }[]>(() =>
    this.appService.getUserAgentsResourceRequest(
      this.statsService.timeRangeDays() ?? undefined,
      this.statsService.selectedRepo() || undefined,
    ),
  );

  readonly loading = this.resource.isLoading;

  readonly hasData = computed(() => this.resource.hasValue());

  readonly chartConfig = computed<ChartConfig<'pie'>>(() => {
    // Don't display more than 30 user agents and truncate overly long ones.
    const maxUserAgents = 30;
    const maxNameLength = 50;
    const relevantData = (resourceValue(this.resource) ?? [])
      .slice(0, Math.min(maxUserAgents, this.statsService.userAgentMetricRange()))
      .map((entry) => ({
        name: entry.name.length > maxNameLength ? `${entry.name.substring(0, maxNameLength)}...` : entry.name,
        count: entry.count,
      }));

    const labels: string[] = [];
    const data: number[] = [];
    for (const entry of relevantData) {
      labels.push(entry.name);
      data.push(entry.count);
    }

    return {
      data: {
        labels,
        datasets: [
          {
            data,
            label: 'Router hits',
            backgroundColor: shuffleArray(CATPPUCCIN_FLAVOURS),
          },
        ],
      },
      options: mochaPieChartOptions(),
    };
  });

  constructor() {
    this.observer
      .observe(['(max-width: 768px)'])
      .pipe(takeUntilDestroyed())
      .subscribe((state) => {
        this.statsService.userAgentMetricRange.set(state.matches ? 5 : 10);
      });
  }
}
