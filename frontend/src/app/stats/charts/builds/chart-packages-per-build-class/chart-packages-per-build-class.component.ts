import { Component, computed, inject } from '@angular/core';
import { buildClassSortKey } from '@chaotic-next/shared-lib';
import { TranslocoService } from '@jsverse/transloco';
import { ALL_TIME_DAYS, AppService } from '../../../../app.service';
import { parseCount } from '../../../../functions';
import { injectActiveTranslation } from '../../../../i18n/active-translation';
import { translateBuildClass } from '../../../../pipes/build-class.pipe';
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
  private readonly transloco = inject(TranslocoService);

  private readonly activeTranslation = injectActiveTranslation();

  readonly chart = chartResource<{ build_class: string; count: string }[]>(() =>
    this.appService.getPackagesPerBuildClassRequest(this.statsService.timeRangeDays() ?? ALL_TIME_DAYS),
  );

  readonly chartConfig = computed<ChartConfig<'pie'>>(() => {
    this.activeTranslation();

    const data = [...this.chart.data()].sort(
      (a, b) => buildClassSortKey(a.build_class) - buildClassSortKey(b.build_class),
    );
    return {
      data: {
        labels: data.map((d) => translateBuildClass(d.build_class, this.transloco)),
        datasets: [
          {
            label: this.transloco.translate('stats.charts.packages'),
            data: data.map((d) => parseCount(d.count)),
            backgroundColor: CATPPUCCIN_FLAVOURS,
          },
        ],
      },
      options: mochaPieChartOptions<'pie'>(),
    };
  });
}
