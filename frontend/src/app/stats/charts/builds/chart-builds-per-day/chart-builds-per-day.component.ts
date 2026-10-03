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
  selector: 'chaotic-chart-builds-per-day',
  imports: [ChartCardComponent],
  templateUrl: './chart-builds-per-day.component.html',
  styleUrl: './chart-builds-per-day.component.css',
})
export class ChartBuildsPerDayComponent {
  private readonly appService = inject(AppService);
  private readonly statsService = inject(StatsService);
  private readonly transloco = inject(TranslocoService);

  private readonly activeTranslation = injectActiveTranslation();

  readonly chart = chartResource<{ day: string; count: string }[]>(() =>
    this.appService.getBuildsPerDayResourceRequest(this.statsService.timeRangeDays() ?? ALL_TIME_DAYS),
  );

  readonly chartConfig = computed<ChartConfig<'line'>>(() => {
    this.activeTranslation();

    const labels: string[] = [];
    const values: number[] = [];
    for (const item of this.chart.data()) {
      labels.push(formatDay(item.day));
      values.push(parseCount(item.count));
    }

    return {
      data: {
        labels,
        datasets: [
          {
            label: this.transloco.translate('stats.charts.buildsPerDay.label'),
            data: values,
            backgroundColor: themePalette().lavender.hex,
            borderColor: themePalette().lavender.hex,
            fill: false,
          },
        ],
      },
      options: axisChartOptions<'line'>(),
    };
  });
}
