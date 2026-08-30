import { Component, computed, inject } from '@angular/core';
import { buildClassLabel, buildClassSortKey } from '@chaotic-next/shared-lib';
import { ALL_TIME_DAYS, AppService } from '../../../../app.service';
import { parseCount } from '../../../../functions';
import { CATPPUCCIN_FLAVOURS } from '../../../../theme';
import { StatsService } from '../../../stats.service';
import { ChartCardComponent } from '../../chart-card/chart-card.component';
import { chartResource, type ChartConfig, mochaPieChartOptions } from '../../chart-config';

@Component({
  selector: 'chaotic-chart-packages-per-build-class',
  imports: [ChartCardComponent],
  templateUrl: './chart-packages-per-build-class.component.html',
  styleUrl: './chart-packages-per-build-class.component.css',
})
export class ChartPackagesPerBuildClassComponent {
  private readonly appService = inject(AppService);
  private readonly statsService = inject(StatsService);

  readonly chart = chartResource<{ build_class: string; count: string }[]>(() =>
    this.appService.getPackagesPerBuildClassRequest(this.statsService.timeRangeDays() ?? ALL_TIME_DAYS),
  );

  readonly chartConfig = computed<ChartConfig<'pie'>>(() => {
    const data = [...this.chart.data()].sort(
      (a, b) => buildClassSortKey(a.build_class) - buildClassSortKey(b.build_class),
    );
    return {
      data: {
        labels: data.map((d) => buildClassLabel(d.build_class)),
        datasets: [
          {
            label: 'Packages',
            data: data.map((d) => parseCount(d.count)),
            backgroundColor: CATPPUCCIN_FLAVOURS,
          },
        ],
      },
      options: mochaPieChartOptions<'pie'>(),
    };
  });
}
