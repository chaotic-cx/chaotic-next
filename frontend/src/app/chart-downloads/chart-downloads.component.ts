import type { PackageRankList } from '@./shared-lib';
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
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { flavors } from '@catppuccin/palette';
import { MessageToastService } from '@garudalinux/core';
import { UIChart } from 'primeng/chart';
import { InputNumber } from 'primeng/inputnumber';
import { ProgressBarModule } from 'primeng/progressbar';
import { ToastModule } from 'primeng/toast';
import { retry } from 'rxjs';
import { AppService } from '../app.service';
import { StatsService } from '../stats/stats.service';

@Component({
  selector: 'chaotic-chart-downloads',
  imports: [FormsModule, UIChart, InputNumber, ProgressBarModule, ToastModule],
  templateUrl: './chart-downloads.component.html',
  styleUrl: './chart-downloads.component.css',
  providers: [MessageToastService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartDownloadsComponent implements OnInit {
  chartData: any;
  isWide = signal<boolean>(true);
  options: any;
  platformId = inject(PLATFORM_ID);

  private readonly appService = inject(AppService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly messageToastService = inject(MessageToastService);
  private readonly observer = inject(BreakpointObserver);

  protected readonly statsService = inject(StatsService);

  constructor() {
    effect(() => {
      this.updatePackageMetrics();
      this.initChart();
    });
  }

  ngOnInit(): void {
    this.observer.observe(['(max-width: 768px)']).subscribe((state) => {
      this.isWide.set(!state.matches);
      if (this.isWide()) {
        this.statsService.globalPackageMetricRange.set(50);
        this.initChart();
      } else {
        this.statsService.globalPackageMetricRange.set(20);
      }
    });
  }

  /**
   * Query the overall package metrics.
   */
  updatePackageMetrics(): void {
    this.appService
      .getOverallPackageStats(untracked(this.statsService.globalPackageMetricRange))
      .pipe(retry({ count: 3, delay: 5000 }))
      .subscribe({
        next: (data) => {
          this.statsService.globalPackageMetrics.set(data);
          if (this.isWide()) {
            this.initChart();
          } else {
            this.getProgressBarValues(data);
            this.cdr.markForCheck();
          }
        },
        error: (err) => {
          this.messageToastService.error('Error', 'Failed to load downloads chart data');
          console.error(err);
        },
        complete: () => this.cdr.markForCheck(),
      });
  }

  initChart(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.chartData = {
        labels: [],
        datasets: [
          {
            data: [],
            label: 'Download count',
            backgroundColor: [flavors.mocha.colors.lavender.hex],
            innerHeight: 100,
          },
        ],
      };

      const metrics = untracked(this.statsService.globalPackageMetrics);
      for (const pkg in metrics) {
        this.chartData.labels.push(metrics[pkg].name);
        this.chartData.datasets[0].data.push(metrics[pkg].count);
      }

      this.options = {
        indexAxis: 'y',
        maintainAspectRatio: false,
        aspectRatio: 0.4,
        plugins: {
          legend: {
            labels: {
              usePointStyle: false,
              color: flavors.mocha.colors.text.hex,
              family: "'Inter', 'Helvetica', 'Arial', sans-serif",
            },
          },
        },
      };

      this.cdr.markForCheck();
    }
  }

  private getProgressBarValues(pkg: PackageRankList) {
    const values = [];
    const metrics = untracked(this.statsService.globalPackageMetrics);
    for (const pkg of metrics) {
      const relativeCount: number = (pkg.count / metrics[0].count) * 100;
      values.push({ value: relativeCount, label: pkg.name, count: pkg.count });
    }

    this.statsService.globalPackageProgressbarValues.set(values);
    this.cdr.markForCheck();
  }
}
