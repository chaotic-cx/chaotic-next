import { Component, computed, inject, input } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { ALL_TIME_DAYS, AppService } from '../../../../app.service';
import { injectActiveTranslation } from '../../../../i18n/active-translation';
import { seriesColor } from '../../../../theme';
import { StatsService } from '../../../stats.service';
import { ChartCardComponent } from '../../chart-card/chart-card.component';
import {
  axisChartOptions,
  chartResource,
  type ChartConfig,
  formatDay,
  hasPlottedValue,
  roundToTenth,
} from '../../chart-config';

@Component({
  selector: 'chaotic-chart-package-average-build-time',
  imports: [ChartCardComponent],
  templateUrl: './chart-package-average-build-time.component.html',
})
export class ChartPackageAverageBuildTimeComponent {
  private readonly appService = inject(AppService);
  private readonly statsService = inject(StatsService);
  private readonly transloco = inject(TranslocoService);

  private readonly activeTranslation = injectActiveTranslation();

  readonly packageName = input.required<string>();

  readonly chart = chartResource<{ day: string; average: string }[]>(() => {
    const name = this.packageName();
    if (!name) return undefined;
    return this.appService.getAverageBuildTimePerDayForPackageResourceRequest(
      name,
      this.statsService.timeRangeDays() ?? ALL_TIME_DAYS,
    );
  });

  readonly chartConfig = computed<ChartConfig<'line'> | null>(() => {
    this.activeTranslation();

    const rows = this.chart.data();
    if (rows.length === 0) return null;

    const daySet = new Set<string>();
    for (const row of rows) {
      daySet.add(formatDay(row.day));
    }
    const labels = [...daySet].reverse();

    const dataMap = new Map<string, number>();
    for (const row of rows) {
      dataMap.set(formatDay(row.day), roundToTenth(Number(row.average)));
    }

    const config: ChartConfig<'line'> = {
      data: {
        labels,
        datasets: [
          {
            label: this.transloco.translate('stats.charts.packageAverageBuildTime.label', {
              package: this.packageName(),
            }),
            data: labels.map((day) => dataMap.get(day) ?? 0),
            backgroundColor: seriesColor(0),
            borderColor: seriesColor(0),
            fill: false,
          },
        ],
      },
      options: axisChartOptions<'line'>(),
    };

    return hasPlottedValue(config) ? config : null;
  });
}
