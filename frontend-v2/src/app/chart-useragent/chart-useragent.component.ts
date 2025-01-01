import { ChangeDetectorRef, Component, effect, inject, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import type { UserAgentList } from '@./shared-lib';
import { AppService } from '../app.service';
import { InputNumber } from 'primeng/inputnumber';
import { UIChart } from 'primeng/chart';
import { FormsModule } from '@angular/forms';
import { MessageToastService } from '@garudalinux/core';
import { BreakpointObserver } from '@angular/cdk/layout';
import { flavors } from '@catppuccin/palette';
import { shuffleArray } from '../functions';
import { CatppuccinFlavors } from '../theme';

@Component({
  selector: 'chaotic-chart-useragent',
  imports: [CommonModule, InputNumber, UIChart, FormsModule],
  templateUrl: './chart-useragent.component.html',
  styleUrl: './chart-useragent.component.css',
  providers: [MessageToastService],
})
export class ChartUseragentComponent implements OnInit {
  chartData: any;
  options: any;
  platformId = inject(PLATFORM_ID);
  amount = signal<number>(8);

  userAgentMetrics: UserAgentList = [];

  private readonly appService = inject(AppService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly messageToastService = inject(MessageToastService);
  private readonly observer = inject(BreakpointObserver);

  constructor() {
    effect(() => {
      this.initChart();
    });
  }

  ngOnInit() {
    this.observer.observe(['(max-width: 768px)']).subscribe((state) => {
      this.amount.set(state.matches ? 5 : 10);
    });
    this.get30DayUserAgents();
  }

  /**
   * Query the number of user agents in the last 30 days.
   * @returns The number of user agents in the last 30 days.
   */
  private get30DayUserAgents(): void {
    this.appService.get30dayUserAgents().subscribe({
      next: (data) => {
        // We don't want to display >30 user agents
        const rightAmount = data.slice(0, 30);
        // and also not too long user agent strings as that breaks visuals
        for (const entry of rightAmount) {
          if (entry.name.length > 50) {
            entry.name = `${entry.name.substring(0, 50)}...`;
          }
        }

        this.userAgentMetrics = rightAmount;
        this.initChart();
      },
      error: (err) => {
        this.messageToastService.error('Error', 'Failed to load user agent chart data');
        console.error(err);
      },
    });
  }

  initChart(): void {
    if (isPlatformBrowser(this.platformId)) {
      const relevantData = this.userAgentMetrics.slice(0, this.amount());
      this.chartData = {
        labels: [],
        datasets: [
          {
            data: [],
            label: 'Router hits',
            backgroundColor: shuffleArray(CatppuccinFlavors),
          },
        ],
      };
      for (const country in relevantData) {
        this.chartData.labels.push(this.userAgentMetrics[country].name);
        this.chartData.datasets[0].data.push(this.userAgentMetrics[country].count);
      }

      this.options = {
        plugins: {
          legend: {
            labels: {
              usePointStyle: true,
              color: flavors.mocha.colors.text.hex,
            },
          },
        },
      };
      this.cdr.markForCheck();
    }
  }
}
