import { Component, computed, inject, input } from '@angular/core';
import { flavors } from '@catppuccin/palette';
import { ALL_TIME_DAYS, AppService } from '../../../../app.service';
import { parseCount } from '../../../../functions';
import { StatsService } from '../../../stats.service';
import { ChartCardComponent } from '../../chart-card/chart-card.component';
import { chartResource, type ChartConfig, formatDay, mochaAxisChartOptions, mochaScales } from '../../chart-config';

@Component({
  selector: 'chaotic-chart-package-build-stats',
  imports: [ChartCardComponent],
  templateUrl: './chart-package-build-stats.component.html',
  styleUrl: './chart-package-build-stats.component.css',
})
export class ChartPackageBuildStatsComponent {
  private readonly appService = inject(AppService);
  private readonly statsService = inject(StatsService);

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
    const data = this.chart.data();
    if (data.length === 0) return null;
    return this.buildChartConfig(data);
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
          label: `Builds for ${this.packageName()} in ${repo}`,
          data: sortedDays.map((day) => repoData[repo][day] || 0),
          backgroundColor: this.getColor(index),
          borderColor: this.getColor(index),
          fill: false,
        })),
      },
      options: {
        ...mochaAxisChartOptions<'line'>(),
        scales: {
          ...mochaScales(),
          y: {
            ...mochaScales().y,
            ticks: {
              ...mochaScales().y.ticks,
              precision: 0,
            },
          },
        },
      },
    };
  }

  private getColor(index: number): string {
    const colors = [
      flavors.mocha.colors.lavender.hex,
      flavors.mocha.colors.blue.hex,
      flavors.mocha.colors.green.hex,
      flavors.mocha.colors.yellow.hex,
      flavors.mocha.colors.red.hex,
      flavors.mocha.colors.pink.hex,
      flavors.mocha.colors.teal.hex,
      flavors.mocha.colors.mauve.hex,
    ];
    return colors[index % colors.length];
  }
}
