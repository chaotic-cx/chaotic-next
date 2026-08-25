import { httpResource } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import { flavors } from '@catppuccin/palette';
import { UIChart } from '@openng/optimus-ui/chart';
import { AppService, ALL_TIME_DAYS } from '../app.service';
import { type ChartConfig, mochaAxisChartOptions } from '../chart-config';
import { isMobileSignal, resourceValue, truncateLabel } from '../functions';
import { StatsService } from '../stats/stats.service';

interface FlakyPackageRow {
  pkgname: string;
  attempts: number;
  failures: number;
  /** Failure rate from 0 to 1. */
  flakiness: number;
}

const TOP_PACKAGES = 12;

@Component({
  selector: 'chaotic-chart-flaky-packages',
  imports: [UIChart],
  templateUrl: './chart-flaky-packages.component.html',
  styleUrl: './chart-flaky-packages.component.css',
})
export class ChartFlakyPackagesComponent {
  private readonly appService = inject(AppService);
  private readonly statsService = inject(StatsService);

  private readonly resource = httpResource<FlakyPackageRow[]>(() =>
    this.appService.getFlakiestPackagesResourceRequest(this.statsService.timeRangeDays() ?? ALL_TIME_DAYS),
  );

  readonly loading = this.resource.isLoading;
  readonly hasData = computed(() => this.resource.hasValue());
  protected readonly isMobile = isMobileSignal();

  readonly chartConfig = computed<ChartConfig<'bar'>>(() => {
    const rows = (resourceValue(this.resource) ?? []).slice(0, TOP_PACKAGES);
    const labels = rows.map((row) => (this.isMobile() ? truncateLabel(row.pkgname) : row.pkgname));
    const data = rows.map((row) => Math.round(row.flakiness * 100));
    return {
      data: {
        labels,
        datasets: [
          {
            label: 'Failure rate (%)',
            data,
            backgroundColor: flavors.mocha.colors.peach.hex,
          },
        ],
      },
      options: mochaAxisChartOptions<'bar'>({ indexAxis: 'y' }),
    };
  });
}
