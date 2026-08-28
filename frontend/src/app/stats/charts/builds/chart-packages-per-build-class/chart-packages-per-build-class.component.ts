import { httpResource } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import { buildClassLabel, buildClassSortKey } from '@chaotic-next/shared-lib';
import { UIChart } from '@openng/optimus-ui/chart';
import { ALL_TIME_DAYS, AppService } from '../../../../app.service';
import { parseCount, resourceValue } from '../../../../functions';
import { CATPPUCCIN_FLAVOURS } from '../../../../theme';
import { type ChartConfig, mochaPieChartOptions } from '../../chart-config';
import { StatsService } from '../../../stats.service';

@Component({
  selector: 'chaotic-chart-packages-per-build-class',
  imports: [UIChart],
  templateUrl: './chart-packages-per-build-class.component.html',
  styleUrl: './chart-packages-per-build-class.component.css',
})
export class ChartPackagesPerBuildClassComponent {
  private readonly appService = inject(AppService);
  private readonly statsService = inject(StatsService);

  private readonly resource = httpResource<{ build_class: string; count: string }[]>(() =>
    this.appService.getPackagesPerBuildClassRequest(this.statsService.timeRangeDays() ?? ALL_TIME_DAYS),
  );

  readonly loading = this.resource.isLoading;
  readonly hasData = computed(() => this.resource.hasValue());

  readonly chartConfig = computed<ChartConfig<'pie'>>(() => {
    const data = [...(resourceValue(this.resource) ?? [])].sort(
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
