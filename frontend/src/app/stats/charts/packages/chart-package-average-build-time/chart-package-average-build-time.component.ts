import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, computed, inject, input } from '@angular/core';
import { UIChart } from '@openng/optimus-ui/chart';
import { ALL_TIME_DAYS, AppService } from '../../../../app.service';
import { resourceValue } from '../../../../functions';
import { CATPPUCCIN_FLAVOURS } from '../../../../theme';
import { StatsService } from '../../../stats.service';
import { type ChartConfig, mochaAxisChartOptions } from '../../chart-config';

@Component({
  selector: 'chaotic-chart-package-average-build-time',
  imports: [UIChart],
  templateUrl: './chart-package-average-build-time.component.html',
  providers: [DatePipe],
})
export class ChartPackageAverageBuildTimeComponent {
  private readonly appService = inject(AppService);
  private readonly datePipe = inject(DatePipe);
  private readonly statsService = inject(StatsService);

  readonly packageName = input.required<string>();

  private readonly resource = httpResource<{ day: string; average: string }[]>(() => {
    const name = this.packageName();
    if (!name) return undefined;
    return this.appService.getAverageBuildTimePerDayForPackageResourceRequest(
      name,
      this.statsService.timeRangeDays() ?? ALL_TIME_DAYS,
    );
  });

  readonly loading = this.resource.isLoading;

  readonly chartConfig = computed<ChartConfig<'line'> | null>(() => {
    const rows = resourceValue(this.resource);
    if (!rows || rows.length === 0) return null;

    const daySet = new Set<string>();
    for (const row of rows) {
      const day = this.datePipe.transform(row.day, 'shortDate') || row.day;
      daySet.add(day);
    }
    const labels = [...daySet].reverse();

    const dataMap = new Map<string, number>();
    for (const row of rows) {
      const day = this.datePipe.transform(row.day, 'shortDate') || row.day;
      const mins = Number(row.average);
      dataMap.set(day, Math.round(mins * 10) / 10);
    }

    return {
      data: {
        labels,
        datasets: [
          {
            label: `Average build time (minutes) for ${this.packageName()}`,
            data: labels.map((day) => dataMap.get(day) ?? 0),
            backgroundColor: CATPPUCCIN_FLAVOURS[0],
            borderColor: CATPPUCCIN_FLAVOURS[0],
            fill: false,
          },
        ],
      },
      options: mochaAxisChartOptions<'line'>(),
    };
  });
}
