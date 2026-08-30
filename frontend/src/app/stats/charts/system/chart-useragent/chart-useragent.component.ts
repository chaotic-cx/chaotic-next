import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { InputNumber } from '@openng/optimus-ui/inputnumber';
import { AppService } from '../../../../app.service';
import { shuffleArray } from '../../../../functions';
import { CATPPUCCIN_FLAVOURS } from '../../../../theme';
import { StatsService } from '../../../stats.service';
import { ChartCardComponent } from '../../chart-card/chart-card.component';
import { chartResource, type ChartConfig, mochaPieChartOptions } from '../../chart-config';

@Component({
  selector: 'chaotic-chart-useragent',
  imports: [ChartCardComponent, InputNumber, FormsModule],
  templateUrl: './chart-useragent.component.html',
  styleUrl: './chart-useragent.component.css',
})
export class ChartUseragentComponent {
  private readonly appService = inject(AppService);
  private readonly observer = inject(BreakpointObserver);
  protected readonly statsService = inject(StatsService);

  readonly chart = chartResource<{ name: string; count: number }[]>(() =>
    this.appService.getUserAgentsResourceRequest(
      this.statsService.timeRangeDays() ?? undefined,
      this.statsService.selectedRepo() || undefined,
    ),
  );

  readonly chartConfig = computed<ChartConfig<'pie'>>(() => {
    // Don't display more than 30 user agents and truncate overly long ones.
    const maxUserAgents = 30;
    const maxNameLength = 50;
    const relevantData = this.chart
      .data()
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
