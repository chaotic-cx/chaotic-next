import { Component, computed, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { ALL_TIME_DAYS, AppService } from '../../../../app.service';
import { parseCount } from '../../../../functions';
import { injectActiveTranslation } from '../../../../i18n/active-translation';
import { themePalette } from '../../../../theme';
import { StatsService } from '../../../stats.service';
import { ChartCardComponent } from '../../chart-card/chart-card.component';
import { chartResource, type ChartConfig, formatDay, axisChartOptions } from '../../chart-config';

@Component({
  selector: 'chaotic-chart-additions',
  imports: [ChartCardComponent],
  templateUrl: './chart-additions.component.html',
  styleUrl: './chart-additions.component.css',
})
export class ChartAdditionsComponent {
  private readonly appService = inject(AppService);
  private readonly statsService = inject(StatsService);
  private readonly transloco = inject(TranslocoService);

  private readonly activeTranslation = injectActiveTranslation();

  readonly chart = chartResource<{ day: string; count: string }[]>(() =>
    this.appService.getPackageAdditionsResourceRequest(this.statsService.timeRangeDays() ?? ALL_TIME_DAYS),
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
            label: this.transloco.translate('stats.charts.additions.label'),
            data: values.reverse(),
            backgroundColor: themePalette().green.hex,
            borderColor: themePalette().green.hex,
            fill: false,
          },
        ],
      },
      options: axisChartOptions<'line'>(),
    };
  });
}
