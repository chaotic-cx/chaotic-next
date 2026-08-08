import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { flavors } from '@catppuccin/palette';
import { MessageToastService } from '@garudalinux/core';
import { UIChart } from '@openng/optimus-ui/chart';
import { AppService } from '../app.service';

@Component({
  selector: 'chaotic-chart-package-build-stats',
  imports: [UIChart, UIChart],
  templateUrl: './chart-package-build-stats.component.html',
  styleUrl: './chart-package-build-stats.component.css',
  providers: [MessageToastService, DatePipe],
})
export class ChartPackageBuildStatsComponent {
  private readonly appService = inject(AppService);
  private readonly messageToastService = inject(MessageToastService);
  private readonly datePipe = inject(DatePipe);

  readonly packageName = input.required<string>();
  readonly loading = signal(true);

  readonly chartConfig = computed<{ data: any; options: any } | null>(() => {
    const data = this.stats();
    if (!data) return null;
    return this.buildChartConfig(data);
  });

  private readonly stats = signal<{ day: string; repo: string; count: string }[] | null>(null);
  days = 30;

  constructor() {
    // Reload whenever the selected package changes.
    effect(() => {
      if (this.packageName()) this.reload();
    });
  }

  /**
   * Query the build counts per day for the package.
   */
  private reload(): void {
    const name = this.packageName();
    if (!name) return;

    this.loading.set(true);
    this.appService.getBuildsCountByPkgnamePerDay(name, this.days).subscribe({
      next: (data) => {
        this.stats.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.messageToastService.error('Error', 'Failed to load package build stats');
        console.error(err);
      },
    });
  }

  private buildChartConfig(data: { day: string; repo: string; count: string }[]): { data: any; options: any } {
    // Group data by repo
    const repoData: { [repo: string]: { [day: string]: number } } = {};
    const allDays = new Set<string>();

    for (const item of data) {
      if (!repoData[item.repo]) {
        repoData[item.repo] = {};
      }
      repoData[item.repo][item.day] = parseInt(item.count);
      allDays.add(item.day);
    }

    const sortedDays = Array.from(allDays).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

    return {
      data: {
        labels: sortedDays.map((day) => this.datePipe.transform(new Date(day), 'shortDate') || day),
        datasets: Object.keys(repoData).map((repo, index) => ({
          label: `Builds for ${this.packageName()} in ${repo}`,
          data: sortedDays.map((day) => repoData[repo][day] || 0),
          backgroundColor: this.getColor(index),
          borderColor: this.getColor(index),
          fill: false,
        })),
      },
      options: {
        maintainAspectRatio: false,
        aspectRatio: 0.4,
        plugins: {
          legend: {
            labels: {
              usePointStyle: false,
              color: flavors.mocha.colors.text.hex,
              family: "'Inter', 'Helvetica', 'Arial', sans-serif",
            },
          },
        },
        scales: {
          x: {
            ticks: {
              color: flavors.mocha.colors.text.hex,
            },
            grid: {
              color: flavors.mocha.colors.surface0.hex,
            },
          },
          y: {
            ticks: {
              color: flavors.mocha.colors.text.hex,
            },
            grid: {
              color: flavors.mocha.colors.surface0.hex,
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

  onDaysChange(): void {
    this.reload();
  }
}
