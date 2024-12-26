import { ChangeDetectorRef, Component, effect, inject, PLATFORM_ID, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FloatLabel } from 'primeng/floatlabel';
import { InputNumber } from 'primeng/inputnumber';
import { UIChart } from 'primeng/chart';
import { FormsModule } from '@angular/forms';
import type { PackageRankList } from '@./shared-lib';
import { AppService } from '../app.service';
import { MessageService } from 'primeng/api';

@Component({
  selector: 'chaotic-chart-downloads',
  imports: [CommonModule, FloatLabel, InputNumber, UIChart, FormsModule],
  templateUrl: './chart-downloads.component.html',
  styleUrl: './chart-downloads.component.css',
})
export class ChartDownloadsComponent {
  chartData: any;
  options: any;
  platformId = inject(PLATFORM_ID);
  amount = signal<number>(50);

  globalPackageMetrics: PackageRankList = [];

  constructor(
    private appService: AppService,
    private cdr: ChangeDetectorRef,
    private messageService: MessageService,
  ) {
    effect(() => {
      this.updatePackageMetrics();
      this.initChart();
    });
  }

  ngOnInit(): void {
    this.updatePackageMetrics();
  }

  /**
   * Query the overall package metrics.
   */
  updatePackageMetrics(): void {
    this.appService.getOverallPackageStats(this.amount()).subscribe({
      next: (data) => {
        this.globalPackageMetrics = data;
        this.initChart();
      },
      error: (err) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load downloads chart data',
        });
        console.error(err);
        return [];
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
