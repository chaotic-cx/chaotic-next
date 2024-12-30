import { ChangeDetectorRef, Component, effect, inject, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { PackageRankList } from '@./shared-lib';
import { AppService } from '../app.service';
import { MessageToastService } from '@garudalinux/core';
import { BreakpointObserver } from '@angular/cdk/layout';
import { UIChart } from 'primeng/chart';
import { FloatLabel } from 'primeng/floatlabel';
import { InputNumber } from 'primeng/inputnumber';
import { ProgressBarModule } from 'primeng/progressbar';
import { ToastModule } from 'primeng/toast';

@Component({
  selector: 'chaotic-chart-downloads',
  imports: [CommonModule, FormsModule, UIChart, FloatLabel, InputNumber, ProgressBarModule, ToastModule],
  templateUrl: './chart-downloads.component.html',
  styleUrl: './chart-downloads.component.css',
  providers: [MessageToastService],
})
export class ChartDownloadsComponent implements OnInit {
  chartData: any;
  isWide = true;
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
      this.isWide = !state.matches;
      if (this.isWide) {
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
    this.appService.getOverallPackageStats(this.amount()).subscribe({
      next: (data) => {
        this.globalPackageMetrics = data;
        console.log(data);
        if (this.isWide) {
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
    });
  }

  initChart(): void {
    if (isPlatformBrowser(this.platformId)) {
      const documentStyle: CSSStyleDeclaration = getComputedStyle(document.documentElement);
      const textColor: string = documentStyle.color;
      this.chartData = {
        labels: [],
        datasets: [
          {
            data: [],
            label: 'Package',
          },
        ],
      };
      for (const pkg in this.globalPackageMetrics) {
        this.chartData.labels.push(this.globalPackageMetrics[pkg].name);
        this.chartData.datasets[0].data.push(this.globalPackageMetrics[pkg].count);
      }

      this.options = {
        indexAxis: 'y',
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

  private getProgressBarValues(pkg: PackageRankList) {
    const values = [];
    for (const pkg of this.globalPackageMetrics) {
      const relativeCount = (pkg.count / this.globalPackageMetrics[0].count) * 100;
      values.push({ value: relativeCount, label: pkg.name, count: pkg.count });
    }
    this.progressbarValues = values;
  }
}
