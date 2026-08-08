import type { PackageRankList } from '@./shared-lib';
import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, computed, effect, inject, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { flavors } from '@catppuccin/palette';
import { MessageToastService } from '@garudalinux/core';
import { UIChart } from '@openng/optimus-ui/chart';
import { InputNumber } from '@openng/optimus-ui/inputnumber';
import { ProgressBarModule } from '@openng/optimus-ui/progressbar';
import { ToastModule } from '@openng/optimus-ui/toast';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { retry } from 'rxjs';
import { AppService } from '../app.service';
import { StatsService } from '../stats/stats.service';

@Component({
  selector: 'chaotic-chart-downloads',
  imports: [FormsModule, UIChart, InputNumber, ProgressBarModule, ToastModule],
  templateUrl: './chart-downloads.component.html',
  styleUrl: './chart-downloads.component.css',
  providers: [MessageToastService],
})
export class ChartDownloadsComponent {
  private readonly appService = inject(AppService);
  private readonly messageToastService = inject(MessageToastService);
  private readonly observer = inject(BreakpointObserver);
  private readonly statsService = inject(StatsService);

  readonly range = model(50);
  readonly isWide = signal<boolean>(true);
  readonly loading = signal(true);

  readonly chartConfig = computed(() => {
    const metrics = this.statsService.globalPackageMetrics();
    const labels: string[] = [];
    const data: number[] = [];
    for (const pkg of metrics) {
      labels.push(pkg.name);
      data.push(pkg.count);
    }

    return {
      data: {
        labels,
        datasets: [
          {
            data,
            label: 'Download count',
            backgroundColor: [flavors.mocha.colors.lavender.hex],
            innerHeight: 100,
          },
        ],
      },
      options: {
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
      },
    };
  });

  readonly progressbarValues = computed(() => {
    const metrics = this.statsService.globalPackageMetrics();
    const values: { value: number; label: string; count: number }[] = [];
    if (metrics.length > 0) {
      for (const pkg of metrics) {
        const relativeCount: number = (pkg.count / metrics[0].count) * 100;
        values.push({ value: relativeCount, label: pkg.name, count: pkg.count });
      }
    }
    return values;
  });

  constructor() {
    this.observer
      .observe(['(max-width: 768px)'])
      .pipe(takeUntilDestroyed())
      .subscribe((state) => {
        this.isWide.set(!state.matches);
        this.range.set(this.isWide() ? 50 : 20);
      });

    // Refetch when the user changes the range.
    effect(() => {
      const range = this.range();
      this.loading.set(true);
      this.updatePackageMetrics(range);
    });
  }

  /**
   * Query the overall package metrics.
   */
  private updatePackageMetrics(range: number): void {
    this.appService
      .getOverallPackageStats(range)
      .pipe(retry({ count: 3, delay: 5000 }))
      .subscribe({
        next: (data: PackageRankList) => {
          this.statsService.globalPackageMetrics.set(data);
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.messageToastService.error('Error', 'Failed to load downloads chart data');
          console.error(err);
        },
      });
  }
}
