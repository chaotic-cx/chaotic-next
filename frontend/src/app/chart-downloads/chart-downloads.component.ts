import type { PackageRankList } from '@./shared-lib';
import { BreakpointObserver } from '@angular/cdk/layout';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  effect,
  inject,
  OnInit,
  PLATFORM_ID,
  signal,
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

@Component({
  selector: 'chaotic-chart-downloads',
  imports: [CommonModule, FormsModule, UIChart, InputNumber, ProgressBarModule, ToastModule],
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
  amount = signal<number>(50);

  globalPackageMetrics: PackageRankList = [];
  progressbarValues: { value: number; label: string; count: number }[] = [];

  private readonly appService = inject(AppService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly messageToastService = inject(MessageToastService);
  private readonly observer = inject(BreakpointObserver);

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
        this.amount.set(50);
        this.initChart();
      } else {
        this.amount.set(20);
      }
    });
    this.updatePackageMetrics();
  }

  /**
   * Query the overall package metrics.
   */
  updatePackageMetrics(): void {
    this.appService
      .getOverallPackageStats(this.amount())
      .pipe(retry({ count: 3, delay: 5000 }))
      .subscribe({
        next: (data) => {
          this.globalPackageMetrics = data;
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
      for (const pkg in this.globalPackageMetrics) {
        this.chartData.labels.push(this.globalPackageMetrics[pkg].name);
        this.chartData.datasets[0].data.push(this.globalPackageMetrics[pkg].count);
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
    for (const pkg of this.globalPackageMetrics) {
      const relativeCount: number = (pkg.count / this.globalPackageMetrics[0].count) * 100;
      values.push({ value: relativeCount, label: pkg.name, count: pkg.count });
    }

    this.progressbarValues = values;
    this.cdr.markForCheck();
  }
}
