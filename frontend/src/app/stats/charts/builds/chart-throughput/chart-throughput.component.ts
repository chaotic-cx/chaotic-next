import { Component, computed, inject } from '@angular/core';
import type { AccentName } from '@catppuccin/palette';
import { TranslocoService } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { ALL_TIME_DAYS, AppService } from '../../../../app.service';
import { parseCount } from '../../../../functions';
import { injectActiveTranslation } from '../../../../i18n/active-translation';
import { paletteColor } from '../../../../theme';
import { StatsService } from '../../../stats.service';
import { ChartCardComponent } from '../../chart-card/chart-card.component';
import { chartResource, type ChartConfig, formatDay, axisChartOptions } from '../../chart-config';

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
  colorName: AccentName;
}[] = [
  { key: 'success', labelKey: marker('stats.charts.throughput.success'), colorName: 'green' },
  {
    key: 'alreadyBuilt',
    labelKey: marker('stats.charts.throughput.alreadyBuilt'),
    colorName: 'blue',
  },
  { key: 'skipped', labelKey: marker('stats.charts.throughput.skipped'), colorName: 'yellow' },
  { key: 'failed', labelKey: marker('stats.charts.throughput.failed'), colorName: 'red' },
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
          backgroundColor: paletteColor(series.colorName),
          borderColor: paletteColor(series.colorName),
          fill: false,
        })),
      },
      options: axisChartOptions<'line'>(),
    };
  });
}
