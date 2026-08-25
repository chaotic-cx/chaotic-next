import { httpResource } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import { flavors } from '@catppuccin/palette';
import { UIChart } from '@openng/optimus-ui/chart';
import { AppService, ALL_TIME_DAYS } from '../app.service';
import { type ChartConfig, mochaAxisChartOptions } from '../chart-config';
import { isMobileSignal, parseCount, resourceValue, truncateLabel } from '../functions';
import { StatsService } from '../stats/stats.service';

const TOP_PACKAGES = 12;

@Component({
  selector: 'chaotic-chart-failed-hotspots',
  imports: [UIChart],
  templateUrl: './chart-failed-hotspots.component.html',
  styleUrl: './chart-failed-hotspots.component.css',
})
export class ChartFailedHotspotsComponent {
  private readonly appService = inject(AppService);
  private readonly statsService = inject(StatsService);

  private readonly resource = httpResource<{ pkgname: string; count: string }[]>(() =>
    this.appService.getTopFailedBuildsResourceRequest(TOP_PACKAGES, this.statsService.timeRangeDays() ?? ALL_TIME_DAYS),
  );

  readonly loading = this.resource.isLoading;
  readonly hasData = computed(() => this.resource.hasValue());
  protected readonly isMobile = isMobileSignal();

  readonly chartConfig = computed<ChartConfig<'bar'>>(() => {
    const rows = resourceValue(this.resource) ?? [];
    const labels = rows.map((r) => (this.isMobile() ? truncateLabel(r.pkgname) : r.pkgname));
    const data = rows.map((r) => parseCount(r.count));
    return {
      data: {
        labels,
        datasets: [
          {
            label: 'Failed builds',
            data,
            backgroundColor: flavors.mocha.colors.red.hex,
          },
        ],
      },
      options: mochaAxisChartOptions<'bar'>({ indexAxis: 'y' }),
    };
  });
}
