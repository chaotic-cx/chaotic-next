import { BreakpointObserver } from '@angular/cdk/layout';
import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  effect,
  inject,
  OnInit,
  PLATFORM_ID,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { flavors } from '@catppuccin/palette';
import { MessageToastService } from '@garudalinux/core';
import { UIChart } from 'primeng/chart';
import { InputNumber } from 'primeng/inputnumber';
import { retry } from 'rxjs';
import { AppService } from '../app.service';
import { shuffleArray } from '../functions';
import { CatppuccinFlavors } from '../theme';
import { PackageStatsService } from '../package-stats/package-stats.service';

@Component({
  selector: 'chaotic-chart-useragent',
  imports: [InputNumber, UIChart, FormsModule],
  templateUrl: './chart-useragent.component.html',
  styleUrl: './chart-useragent.component.css',
  providers: [MessageToastService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartUseragentComponent implements OnInit {
  chartData: any;
  options: any;
  platformId = inject(PLATFORM_ID);

  private readonly appService = inject(AppService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly messageToastService = inject(MessageToastService);
  private readonly observer = inject(BreakpointObserver);

  protected packageStatsService = inject(PackageStatsService);

  constructor() {
    effect(() => {
      this.initChart();
    });
  }

  ngOnInit() {
    this.observer.observe(['(max-width: 768px)']).subscribe((state) => {
      this.packageStatsService.userAgentMetricRange.set(state.matches ? 5 : 10);
      this.cdr.markForCheck();
    });
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

          this.packageStatsService.userAgentMetrics.set(rightAmount);
          this.initChart();
        },
        error: (err) => {
          this.messageToastService.error('Error', 'Failed to load user agent chart data');
          console.error(err);
        },
        complete: () => this.cdr.markForCheck(),
      });
  }

  initChart(): void {
    if (isPlatformBrowser(this.platformId)) {
      const relevantData = this.packageStatsService
        .userAgentMetrics()
        .slice(0, this.packageStatsService.userAgentMetricRange());
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
        this.chartData.labels.push(this.packageStatsService.userAgentMetrics()[country].name);
        this.chartData.datasets[0].data.push(this.packageStatsService.userAgentMetrics()[country].count);
      }

      this.options = {
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
      };

      this.cdr.markForCheck();
    }
  }
}
