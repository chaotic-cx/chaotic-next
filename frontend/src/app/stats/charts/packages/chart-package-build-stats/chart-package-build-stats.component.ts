import { Component, computed, inject, input } from '@angular/core';
import type { AccentName } from '@catppuccin/palette';
import { TranslocoService } from '@jsverse/transloco';
import { ALL_TIME_DAYS, AppService } from '../../../../app.service';
import { parseCount } from '../../../../functions';
import { injectActiveTranslation } from '../../../../i18n/active-translation';
import { cycledColor } from '../../../../theme';
import { StatsService } from '../../../stats.service';
import { ChartCardComponent } from '../../chart-card/chart-card.component';
import {
  axisChartOptions,
  axisScales,
  chartResource,
  type ChartConfig,
  formatDay,
  hasPlottedValue,
} from '../../chart-config';

const REPO_COLOR_NAMES: readonly AccentName[] = ['lavender', 'blue', 'green', 'yellow', 'red', 'pink', 'teal', 'mauve'];

@Component({
  selector: 'chaotic-chart-package-build-stats',
  imports: [ChartCardComponent],
  templateUrl: './chart-package-build-stats.component.html',
  styleUrl: './chart-package-build-stats.component.css',
})
export class ChartPackageBuildStatsComponent {
  private readonly appService = inject(AppService);
  private readonly statsService = inject(StatsService);
  private readonly transloco = inject(TranslocoService);

  private readonly activeTranslation = injectActiveTranslation();

  readonly packageName = input.required<string>();

  readonly chart = chartResource<{ day: string; repo: string; count: string }[]>(() => {
    const name = this.packageName();
    if (!name) return undefined;
    return this.appService.getBuildsCountByPkgnamePerDayResourceRequest(
      name,
      this.statsService.timeRangeDays() ?? ALL_TIME_DAYS,
    );
  });

  readonly chartConfig = computed<ChartConfig<'line'> | null>(() => {
    this.activeTranslation();

    const data = this.chart.data();
    if (data.length === 0) return null;

    const config = this.buildChartConfig(data);
    return hasPlottedValue(config) ? config : null;
  });

  private buildChartConfig(data: { day: string; repo: string; count: string }[]): ChartConfig<'line'> {
    const repoData: { [repo: string]: { [day: string]: number } } = {};
    const allDays = new Set<string>();

    for (const item of data) {
      if (!repoData[item.repo]) {
        repoData[item.repo] = {};
      }
      repoData[item.repo][item.day] = parseCount(item.count);
      allDays.add(item.day);
    }

    const sortedDays = Array.from(allDays).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

    return {
      data: {
        labels: sortedDays.map((day) => formatDay(day)),
        datasets: Object.keys(repoData).map((repo, index) => ({
          label: this.transloco.translate('stats.charts.packageBuildStats.label', {
            package: this.packageName(),
            repo,
          }),
          data: sortedDays.map((day) => repoData[repo][day] || 0),
          backgroundColor: cycledColor(REPO_COLOR_NAMES, index),
          borderColor: cycledColor(REPO_COLOR_NAMES, index),
          fill: false,
        })),
      },
      options: {
        ...axisChartOptions<'line'>(),
        scales: {
          ...axisScales(),
          y: {
            ...axisScales().y,
            ticks: {
              ...axisScales().y.ticks,
              precision: 0,
            },
          },
        },
      },
    };
  }
}
