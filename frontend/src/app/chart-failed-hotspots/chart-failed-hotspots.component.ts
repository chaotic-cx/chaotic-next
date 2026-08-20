import { httpResource } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import { flavors } from '@catppuccin/palette';
import { UIChart } from '@openng/optimus-ui/chart';
import { AppService } from '../app.service';
import { type ChartConfig, mochaAxisChartOptions } from '../chart-config';
import { parseCount, resourceValue } from '../functions';

const TOP_PACKAGES = 12;

@Component({
  selector: 'chaotic-chart-failed-hotspots',
  imports: [UIChart],
  templateUrl: './chart-failed-hotspots.component.html',
  styleUrl: './chart-failed-hotspots.component.css',
})
export class ChartFailedHotspotsComponent {
  private readonly appService = inject(AppService);

  private readonly resource = httpResource<{ pkgname: string; count: string }[]>(() =>
    this.appService.getTopFailedBuildsResourceRequest(TOP_PACKAGES),
  );

  readonly loading = this.resource.isLoading;
  readonly hasData = computed(() => this.resource.hasValue());

  readonly chartConfig = computed<ChartConfig<'bar'>>(() => {
    const rows = resourceValue(this.resource) ?? [];
    const labels = rows.map((r) => r.pkgname);
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
      options: mochaAxisChartOptions<'bar'>('y'),
    };
  });
}
