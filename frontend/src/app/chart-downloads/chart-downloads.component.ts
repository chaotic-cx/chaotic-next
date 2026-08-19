import type { PackageRankList } from '@chaotic-next/shared-lib';
import { httpResource } from '@angular/common/http';
import { Component, computed, inject, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UIChart } from '@openng/optimus-ui/chart';
import { InputNumber } from '@openng/optimus-ui/inputnumber';
import { AppService } from '../app.service';
import { type ChartConfig, mochaAxisChartOptions } from '../chart-config';
import { resourceValue } from '../functions';
import { StatsService } from '../stats/stats.service';
import { CATPPUCCIN_FLAVOURS } from '../theme';

@Component({
  selector: 'chaotic-chart-downloads',
  imports: [FormsModule, UIChart, InputNumber],
  templateUrl: './chart-downloads.component.html',
  styleUrl: './chart-downloads.component.css',
})
export class ChartDownloadsComponent {
  private readonly appService = inject(AppService);
  private readonly statsService = inject(StatsService);

  readonly range = model(50);

  private readonly resource = httpResource<PackageRankList>(() =>
    this.appService.getOverallPackageStatsResourceRequest(this.range(), this.statsService.timeRangeDays() ?? undefined),
  );

  readonly loading = this.resource.isLoading;

  readonly hasData = computed(() => this.resource.hasValue());

  readonly chartConfig = computed<ChartConfig<'bar'>>(() => {
    const metrics = resourceValue(this.resource) ?? [];
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
            backgroundColor: CATPPUCCIN_FLAVOURS,
          },
        ],
      },
      options: mochaAxisChartOptions<'bar'>('y'),
    };
  });
}
