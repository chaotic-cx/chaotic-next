import { Component, computed, inject } from '@angular/core';
import { flavors } from '@catppuccin/palette';
import { TranslocoService } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { ALL_TIME_DAYS, AppService } from '../../../../app.service';
import { parseCount } from '../../../../functions';
import { injectActiveTranslation } from '../../../../i18n/active-translation';
import { StatsService } from '../../../stats.service';
import { ChartCardComponent } from '../../chart-card/chart-card.component';
import { chartResource, type ChartConfig, formatDay, mochaAxisChartOptions } from '../../chart-config';

interface ThroughputRow {
  day: string;
  success: string;
  alreadyBuilt: string;
  skipped: string;
  failed: string;
}

const SERIES: {
  key: keyof Pick<ThroughputRow, 'success' | 'alreadyBuilt' | 'skipped' | 'failed'>;
  labelKey: string;
  color: string;
}[] = [
  { key: 'success', labelKey: marker('stats.charts.throughput.success'), color: flavors.mocha.colors.green.hex },
  {
    key: 'alreadyBuilt',
    labelKey: marker('stats.charts.throughput.alreadyBuilt'),
    color: flavors.mocha.colors.blue.hex,
  },
  { key: 'skipped', labelKey: marker('stats.charts.throughput.skipped'), color: flavors.mocha.colors.yellow.hex },
  { key: 'failed', labelKey: marker('stats.charts.throughput.failed'), color: flavors.mocha.colors.red.hex },
];

@Component({
  selector: 'chaotic-chart-throughput',
  imports: [ChartCardComponent],
  templateUrl: './chart-throughput.component.html',
  styleUrl: './chart-throughput.component.css',
})
export class ChartThroughputComponent {
  private readonly appService = inject(AppService);
  private readonly statsService = inject(StatsService);
  private readonly transloco = inject(TranslocoService);

  private readonly activeTranslation = injectActiveTranslation();

  readonly chart = chartResource<ThroughputRow[]>(() =>
    this.appService.getThroughputResourceRequest(this.statsService.timeRangeDays() ?? ALL_TIME_DAYS),
  );

  readonly chartConfig = computed<ChartConfig<'line'>>(() => {
    this.activeTranslation();

    const rows = this.chart.data();
    const daySet = new Set<string>();
    for (const row of rows) {
      daySet.add(formatDay(row.day));
    }
    const labels = [...daySet].reverse();

    const byDay = new Map<string, ThroughputRow>();
    for (const row of rows) {
      byDay.set(formatDay(row.day), row);
    }

    return {
      data: {
        labels,
        datasets: SERIES.map((series) => ({
          label: this.transloco.translate(series.labelKey),
          data: labels.map((day) => parseCount(byDay.get(day)?.[series.key] ?? '0')),
          backgroundColor: series.color,
          borderColor: series.color,
          fill: false,
        })),
      },
      options: mochaAxisChartOptions<'line'>(),
    };
  });
}
