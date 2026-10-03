import { Component, computed, inject } from '@angular/core';
import { flavors } from '@catppuccin/palette';
import { TranslocoService } from '@jsverse/transloco';
import { ALL_TIME_DAYS, AppService } from '../../../../app.service';
import { parseCount } from '../../../../functions';
import { injectActiveTranslation } from '../../../../i18n/active-translation';
import { StatsService } from '../../../stats.service';
import { ChartCardComponent } from '../../chart-card/chart-card.component';
import { chartResource, type ChartConfig, formatDay, mochaAxisChartOptions } from '../../chart-config';

@Component({
  selector: 'chaotic-chart-removals',
  imports: [ChartCardComponent],
  templateUrl: './chart-removals.component.html',
  styleUrl: './chart-removals.component.css',
})
export class ChartRemovalsComponent {
  private readonly appService = inject(AppService);
  private readonly statsService = inject(StatsService);
  private readonly transloco = inject(TranslocoService);

  private readonly activeTranslation = injectActiveTranslation();

  readonly chart = chartResource<{ day: string; count: string }[]>(() =>
    this.appService.getPackageRemovalsResourceRequest(this.statsService.timeRangeDays() ?? ALL_TIME_DAYS),
  );

  readonly chartConfig = computed<ChartConfig<'line'>>(() => {
    this.activeTranslation();

    const labels: string[] = [];
    const values: number[] = [];
    for (const row of this.chart.data()) {
      labels.push(formatDay(row.day));
      values.push(parseCount(row.count));
    }
    return {
      data: {
        labels: labels.reverse(),
        datasets: [
          {
            label: this.transloco.translate('stats.charts.removals.label'),
            data: values.reverse(),
            backgroundColor: flavors.mocha.colors.red.hex,
            borderColor: flavors.mocha.colors.red.hex,
            fill: false,
          },
        ],
      },
      options: mochaAxisChartOptions<'line'>(),
    };
  });
}
