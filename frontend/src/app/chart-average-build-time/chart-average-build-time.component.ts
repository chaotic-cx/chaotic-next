import { httpResource } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import { BuildStatus, isBuildStatus, STATUS_DISPLAY_NAMES } from '@chaotic-next/shared-lib';
import { UIChart } from '@openng/optimus-ui/chart';
import { AppService } from '../app.service';
import { type ChartConfig, mochaAxisChartOptions } from '../chart-config';
import { resourceValue, shuffleArray } from '../functions';
import { StatsService } from '../stats/stats.service';
import { CATPPUCCIN_FLAVOURS } from '../theme';

interface AverageBuildTimeRow {
  status: BuildStatus;
  averageBuildTime: number;
}

@Component({
  selector: 'chaotic-chart-average-build-time',
  imports: [UIChart],
  templateUrl: './chart-average-build-time.component.html',
  styleUrl: './chart-average-build-time.component.css',
})
export class ChartAverageBuildTimeComponent {
  private readonly appService = inject(AppService);
  private readonly statsService = inject(StatsService);

  private readonly resource = httpResource<{ average_build_time: string; status: string }[]>(() =>
    this.appService.getAverageBuildTimeResourceRequest(this.statsService.timeRangeDays() ?? undefined),
  );

  readonly loading = this.resource.isLoading;

  readonly hasData = computed(() => this.resource.hasValue());

  private readonly rows = computed<AverageBuildTimeRow[]>(() =>
    (resourceValue(this.resource) ?? [])
      .map((item): AverageBuildTimeRow | null => {
        const status = Number(item.status);
        const averageBuildTime = Number(item.average_build_time);
        return isBuildStatus(status) && Number.isFinite(averageBuildTime) ? { status, averageBuildTime } : null;
      })
      .filter((row): row is AverageBuildTimeRow => row !== null),
  );

  readonly chartConfig = computed<ChartConfig<'bar'>>(() => {
    const labels: string[] = [];
    const values: number[] = [];
    for (const row of this.rows().filter((row) => row.status !== BuildStatus.TIMED_OUT)) {
      labels.push(STATUS_DISPLAY_NAMES[row.status]);
      values.push(row.averageBuildTime);
    }

    return {
      data: {
        labels,
        datasets: [
          {
            data: values,
            label: 'Average build time (minutes)',
            backgroundColor: shuffleArray(CATPPUCCIN_FLAVOURS),
          },
        ],
      },
      options: mochaAxisChartOptions<'bar'>(),
    };
  });
}
