import { DatePipe, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  input,
  OnChanges,
  PLATFORM_ID,
  SimpleChanges,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { flavors } from '@catppuccin/palette';
import { MessageToastService } from '@garudalinux/core';
import { UIChart } from 'primeng/chart';
import { retry } from 'rxjs';
import { AppService } from '../app.service';

@Component({
  selector: 'chaotic-chart-package-build-stats',
  imports: [UIChart, FormsModule],
  templateUrl: './chart-package-build-stats.component.html',
  styleUrl: './chart-package-build-stats.component.css',
  providers: [MessageToastService, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartPackageBuildStatsComponent implements OnChanges {
  packageName = input.required<string>();

  chartData: any;
  options: any;
  platformId = inject(PLATFORM_ID);
  days = 30;

  private readonly appService = inject(AppService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly messageToastService = inject(MessageToastService);
  private readonly datePipe = inject(DatePipe);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['packageName'] && this.packageName()) {
      this.getPackageBuildStats();
    }
  }

  /**
   * Query the build counts per day for the package.
   */
  private getPackageBuildStats(): void {
    if (!this.packageName) return;

    this.appService.getBuildsCountByPkgnamePerDay(this.packageName(), this.days).subscribe({
      next: (data) => {
        this.initChart(data);
      },
      error: (err) => {
        this.messageToastService.error('Error', 'Failed to load package build stats');
        console.error(err);
      },
      complete: () => this.cdr.markForCheck(),
    });
  }

  initChart(data: { day: string; repo: string; count: string }[]): void {
    if (isPlatformBrowser(this.platformId)) {
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

      this.chartData = {
        labels: sortedDays.map((day) => this.datePipe.transform(new Date(day), 'shortDate') || day),
        datasets: Object.keys(repoData).map((repo, index) => ({
          label: `Builds for ${this.packageName()} in ${repo}`,
          data: sortedDays.map((day) => repoData[repo][day] || 0),
          backgroundColor: this.getColor(index),
          borderColor: this.getColor(index),
          fill: false,
        })),
      };

      this.options = {
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
      };

      this.cdr.markForCheck();
    }
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
    if (this.packageName()) {
      this.getPackageBuildStats();
    }
  }
}
