import { httpResource } from '@angular/common/http';
import { Component, computed, inject, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PackageRankList } from '@chaotic-next/shared-lib';
import { UIChart } from '@openng/optimus-ui/chart';
import { InputNumber } from '@openng/optimus-ui/inputnumber';
import { AppService } from '../../../../app.service';
import { isMobileSignal, resourceValue, truncateLabel } from '../../../../functions';
import { CATPPUCCIN_FLAVOURS } from '../../../../theme';
import { StatsService } from '../../../stats.service';
import { type ChartConfig, mochaAxisChartOptions } from '../../chart-config';

@Component({
  selector: 'chaotic-chart-downloads',
  imports: [UIChart, InputNumber, FormsModule],
  templateUrl: './chart-downloads.component.html',
  styleUrl: './chart-downloads.component.css',
})
export class ChartDownloadsComponent {
  private readonly appService = inject(AppService);
  private readonly statsService = inject(StatsService);

  readonly range = model(20);

  protected readonly Math = Math;
  protected readonly isMobile = isMobileSignal();

  private readonly resource = httpResource<PackageRankList>(() => {
    const val = Math.max(1, this.range() || 1);
    return this.appService.getOverallPackageStatsResourceRequest(
      val,
      this.statsService.timeRangeDays() ?? undefined,
      this.statsService.selectedRepo() || undefined,
    );
  });

  readonly loading = this.resource.isLoading;

  readonly hasData = computed(() => this.resource.hasValue());

  readonly chartConfig = computed<ChartConfig<'bar'>>(() => {
    const metrics = resourceValue(this.resource) ?? [];
    const labels: string[] = [];
    const data: number[] = [];
    for (const pkg of metrics) {
      labels.push(this.isMobile() ? truncateLabel(pkg.name) : pkg.name);
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
      options: mochaAxisChartOptions<'bar'>({ indexAxis: 'y' }),
    };
  });
}
