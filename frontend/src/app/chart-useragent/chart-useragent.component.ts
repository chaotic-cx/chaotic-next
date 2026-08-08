import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { flavors } from '@catppuccin/palette';
import { MessageToastService } from '@garudalinux/core';
import { UIChart } from '@openng/optimus-ui/chart';
import { InputNumber } from '@openng/optimus-ui/inputnumber';
import { retry } from 'rxjs';
import { AppService } from '../app.service';
import { shuffleArray } from '../functions';
import { StatsService } from '../stats/stats.service';
import { CATPPUCCIN_FLAVOURS } from '../theme';

interface ChartConfig {
  data: any;
  options: any;
}

@Component({
  selector: 'chaotic-chart-useragent',
  imports: [InputNumber, UIChart, FormsModule],
  templateUrl: './chart-useragent.component.html',
  styleUrl: './chart-useragent.component.css',
  providers: [MessageToastService],
})
export class ChartUseragentComponent implements OnInit {
  private readonly appService = inject(AppService);
  private readonly messageToastService = inject(MessageToastService);
  private readonly observer = inject(BreakpointObserver);
  protected readonly statsService = inject(StatsService);

  readonly chartConfig = computed<ChartConfig>(() => {
    const relevantData = this.statsService.userAgentMetrics().slice(0, this.statsService.userAgentMetricRange());
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
      options: {
        plugins: {
          legend: {
            labels: {
              usePointStyle: false,
              color: flavors.mocha.colors.text.hex,
              family: "'Inter', 'Helvetica', 'Arial', sans-serif",
            },
            position: 'top',
          },
        },
      },
    };
  });

  readonly loading = signal(true);

  constructor() {
    this.observer
      .observe(['(max-width: 768px)'])
      .pipe(takeUntilDestroyed())
      .subscribe((state) => {
        this.statsService.userAgentMetricRange.set(state.matches ? 5 : 10);
      });
  }

  ngOnInit(): void {
    this.get30DayUserAgents();
  }

  /**
   * Query the number of user agents in the last 30 days.
   * @returns The number of user agents in the last 30 days.
   */
  private get30DayUserAgents(): void {
    this.appService
      .get30dayUserAgents()
      .pipe(retry({ count: 3, delay: 5000 }))
      .subscribe({
        next: (data) => {
          // We don't want to display >30 user agents
          const rightAmount = data.slice(0, 30);
          // and also not too long user agent strings as that breaks visuals
          for (const entry of rightAmount) {
            if (entry.name.length > 50) {
              entry.name = `${entry.name.substring(0, 50)}...`;
            }
          }

          this.statsService.userAgentMetrics.set(rightAmount);
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.messageToastService.error('Error', 'Failed to load user agent chart data');
          console.error(err);
        },
      });
  }
}
