import { Component, computed, inject } from '@angular/core';
import { BuildStatus, isBuildStatus } from '@chaotic-next/shared-lib';
import { TranslocoService } from '@jsverse/transloco';
import { AppService } from '../../../../app.service';
import { injectActiveTranslation } from '../../../../i18n/active-translation';
import { BUILD_STATUS_LABEL_KEYS } from '../../../../i18n/build-status-labels';
import { StatsService } from '../../../stats.service';
import { ChartCardComponent } from '../../chart-card/chart-card.component';
import { chartResource, type ChartConfig, mochaAxisChartOptions, SINGLE_SERIES_COLOR } from '../../chart-config';

interface AverageBuildTimeRow {
  status: BuildStatus;
  averageBuildTime: number;
}

@Component({
  selector: 'chaotic-chart-average-build-time',
  imports: [ChartCardComponent],
  templateUrl: './chart-average-build-time.component.html',
  styleUrl: './chart-average-build-time.component.css',
})
export class ChartAverageBuildTimeComponent {
  private readonly appService = inject(AppService);
  private readonly statsService = inject(StatsService);
  private readonly transloco = inject(TranslocoService);

  private readonly activeTranslation = injectActiveTranslation();

  readonly chart = chartResource<{ average_build_time: string; status: string }[]>(() =>
    this.appService.getAverageBuildTimeResourceRequest(this.statsService.timeRangeDays() ?? undefined),
  );

  private readonly rows = computed<AverageBuildTimeRow[]>(() =>
    this.chart
      .data()
      .map((item): AverageBuildTimeRow | null => {
        const status = Number(item.status);
        const averageBuildTime = Number(item.average_build_time);
        return isBuildStatus(status) && Number.isFinite(averageBuildTime) ? { status, averageBuildTime } : null;
      })
      .filter((row): row is AverageBuildTimeRow => row !== null),
  );

  readonly chartConfig = computed<ChartConfig<'bar'>>(() => {
    this.activeTranslation();

    const labels: string[] = [];
    const values: number[] = [];
    for (const row of this.rows().filter((row) => row.status !== BuildStatus.TIMED_OUT)) {
      labels.push(this.transloco.translate(BUILD_STATUS_LABEL_KEYS[row.status]));
      values.push(row.averageBuildTime);
    }

    return {
      data: {
        labels,
        datasets: [
          {
            data: values,
            label: this.transloco.translate('stats.charts.averageBuildTime.label'),
            backgroundColor: SINGLE_SERIES_COLOR,
            borderRadius: 4,
          },
        ],
      },
      options: mochaAxisChartOptions<'bar'>({ showLegend: false }),
    };
  });
}
