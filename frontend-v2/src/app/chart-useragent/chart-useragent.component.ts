import { ChangeDetectorRef, Component, effect, inject, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import type { UserAgentList } from '@./shared-lib';
import { AppService } from '../app.service';
import { InputNumber } from 'primeng/inputnumber';
import { UIChart } from 'primeng/chart';
import { FormsModule } from '@angular/forms';
import { FloatLabel } from 'primeng/floatlabel';
import { MessageService } from 'primeng/api';

@Component({
  selector: 'chaotic-chart-useragent',
  imports: [CommonModule, InputNumber, UIChart, FormsModule, FloatLabel],
  templateUrl: './chart-useragent.component.html',
  styleUrl: './chart-useragent.component.css',
})
export class ChartUseragentComponent implements OnInit {
  chartData: any;
  options: any;
  platformId = inject(PLATFORM_ID);
  amount = signal<number>(8);

  userAgentMetrics: UserAgentList = [];

  constructor(
    private appService: AppService,
    private cdr: ChangeDetectorRef,
    private messageService: MessageService,
  ) {
    effect(() => {
      this.initChart();
    });
  }

  ngOnInit() {
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
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load user agent chart data',
        });
        console.error(err);
      },
    });
  }

  initChart(): void {
    if (isPlatformBrowser(this.platformId)) {
      const documentStyle: CSSStyleDeclaration = getComputedStyle(document.documentElement);
      const textColor: string = documentStyle.color;
      const relevantData = this.userAgentMetrics.slice(0, this.amount());
      this.chartData = {
        labels: [],
        datasets: [
          {
            data: [],
            label: 'Country',
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
              color: textColor,
            },
          },
        },
      };
      this.cdr.markForCheck();
    }
  }
}
