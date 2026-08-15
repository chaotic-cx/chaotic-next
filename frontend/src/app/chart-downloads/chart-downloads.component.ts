import type { PackageRankList } from '@chaotic-next/shared-lib';
import { BreakpointObserver } from '@angular/cdk/layout';
import { httpResource } from '@angular/common/http';
import { Component, computed, inject, model, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { flavors } from '@catppuccin/palette';
import { UIChart } from '@openng/optimus-ui/chart';
import { InputNumber } from '@openng/optimus-ui/inputnumber';
import { ProgressBarModule } from '@openng/optimus-ui/progressbar';
import { ToastModule } from '@openng/optimus-ui/toast';
import { AppService } from '../app.service';
import { type ChartConfig, mochaLegendLabels } from '../chart-config';
import { StatsService } from '../stats/stats.service';

@Component({
  selector: 'chaotic-chart-downloads',
  imports: [FormsModule, UIChart, InputNumber, ProgressBarModule, ToastModule],
  templateUrl: './chart-downloads.component.html',
  styleUrl: './chart-downloads.component.css',
})
export class ChartDownloadsComponent {
  private readonly appService = inject(AppService);
  private readonly observer = inject(BreakpointObserver);
  private readonly statsService = inject(StatsService);

  readonly range = model(50);
  readonly isWide = signal<boolean>(true);

  private readonly resource = httpResource<PackageRankList>(() =>
    this.appService.getOverallPackageStatsResourceRequest(this.range(), this.statsService.timeRangeDays() ?? undefined),
  );

  readonly loading = this.resource.isLoading;

  readonly hasData = computed(() => this.resource.hasValue());

  readonly chartConfig = computed<ChartConfig<'bar'>>(() => {
    const metrics = this.resource.value() ?? [];
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
          },
        ],
      },
      options: {
        indexAxis: 'y',
        maintainAspectRatio: false,
        aspectRatio: 0.4,
        plugins: {
          legend: { labels: mochaLegendLabels() },
        },
      },
    };
  });

  readonly progressbarValues = computed(() => {
    const metrics = this.resource.value() ?? [];
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
  }
}
