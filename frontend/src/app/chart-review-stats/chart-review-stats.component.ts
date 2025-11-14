import { BreakpointObserver } from '@angular/cdk/layout';
import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  effect,
  inject,
  OnInit,
  PLATFORM_ID,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { flavors } from '@catppuccin/palette';
import { MessageToastService } from '@garudalinux/core';
import { UIChart } from 'primeng/chart';
import { retry } from 'rxjs';
import { AppService } from '../app.service';
import { shuffleArray } from '../functions';
import { CatppuccinFlavors } from '../theme';
import { StatsService } from '../stats/stats.service';
import { map } from 'rxjs/operators';

@Component({
  selector: 'chaotic-chart-review-stats',
  imports: [UIChart, FormsModule],
  templateUrl: './chart-review-stats.component.html',
  styleUrl: './chart-review-stats.component.css',
  providers: [MessageToastService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartReviewStatsComponent implements OnInit {
  chartData: any;
  options: any;
  platformId = inject(PLATFORM_ID);

  private readonly appService = inject(AppService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly messageToastService = inject(MessageToastService);
  private readonly observer = inject(BreakpointObserver);

  protected readonly packageStatsService = inject(StatsService);

  constructor() {
    effect(() => {
      this.initChart();
    });
  }

  ngOnInit(): void {
    this.observer.observe(['(max-width: 768px)']).subscribe(() => {
      // For review stats, we can show more on mobile since it's usernames
      this.cdr.markForCheck();
    });
    this.getUpdateReviewStats();
  }

  /**
   * Query the update review stats.
   */
  private getUpdateReviewStats(): void {
    this.appService
      .getUpdateReviewStats()
      .pipe(
        retry({ count: 3, delay: 5000 }),
        map((data) => {
          return data
            .sort((a, b) => b.reviews - a.reviews)
            .filter((entry) => !entry.username.startsWith('gitlab_') && !entry.username.startsWith('project_'));
        }),
      )
      .subscribe({
        next: (data) => {
          this.packageStatsService.reviewStats.set(data);
          this.initChart();
        },
        error: (err: unknown) => {
          this.messageToastService.error('Error', 'Failed to retrieve MR review stats');
          console.error(err);
        },
        complete: () => this.cdr.markForCheck(),
      });
  }

  initChart(): void {
    if (isPlatformBrowser(this.platformId)) {
      const reviewStats = this.packageStatsService.reviewStats();

      this.chartData = {
        labels: [] as string[],
        datasets: [
          {
            data: [] as number[],
            label: 'Reviews',
            backgroundColor: shuffleArray(CatppuccinFlavors),
          },
        ],
      };

      for (const stat of reviewStats) {
        this.chartData.labels.push(stat.username);
        this.chartData.datasets[0].data.push(stat.reviews);
      }

      this.options = {
        plugins: {
          legend: {
            labels: {
              usePointStyle: false,
              color: flavors.mocha.colors.text.hex,
              family: "'Inter', 'Helvetica', 'Arial', sans-serif",
            },
            position: 'top' as const,
          },
        },
      };

      this.cdr.markForCheck();
    }
  }
}
