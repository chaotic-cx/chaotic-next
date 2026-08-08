import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { flavors } from '@catppuccin/palette';
import { MessageToastService } from '@garudalinux/core';
import { UIChart } from '@openng/optimus-ui/chart';
import { retry } from 'rxjs';
import { map } from 'rxjs/operators';
import { AppService } from '../app.service';
import { shuffleArray } from '../functions';
import { StatsService } from '../stats/stats.service';
import { CATPPUCCIN_FLAVOURS } from '../theme';

interface ChartConfig {
  data: any;
  options: any;
}

@Component({
  selector: 'chaotic-chart-review-stats',
  imports: [UIChart],
  templateUrl: './chart-review-stats.component.html',
  styleUrl: './chart-review-stats.component.css',
  providers: [MessageToastService],
})
export class ChartReviewStatsComponent implements OnInit {
  private readonly appService = inject(AppService);
  private readonly messageToastService = inject(MessageToastService);
  private readonly statsService = inject(StatsService);

  readonly chartConfig = computed<ChartConfig>(() => {
    const reviewStats = this.statsService.reviewStats();
    const labels: string[] = [];
    const data: number[] = [];
    for (const stat of reviewStats) {
      labels.push(stat.username);
      data.push(stat.reviews);
    }

    return {
      data: {
        labels,
        datasets: [
          {
            data,
            label: 'Reviews',
            backgroundColor: shuffleArray(CATPPUCCIN_FLAVOURS),
          },
        ],
      },
      options: {
        plugins: {
          legend: {
            labels: {
              usePointStyle: false,
              color: flavors.mocha.colors.text.hex,
              family: "'Inter', 'Helvetica', 'Arial', sans-serif",
            },
            position: 'top',
          },
        },
      },
    };
  });

  readonly loading = signal(true);

  ngOnInit(): void {
    this.getUpdateReviewStats();
  }

  /**
   * Query the update review stats.
   */
  private getUpdateReviewStats(): void {
    this.appService
      .getUpdateReviewStats()
      .pipe(
        retry({ count: 2, delay: 2000 }),
        map((data) => {
          return data
            .sort((a, b) => b.reviews - a.reviews)
            .filter((entry) => !entry.username.startsWith('gitlab_') && !entry.username.startsWith('project_'))
            .filter((e) => e.reviews > 0 && e.username !== 'temeraire-cx');
        }),
      )
      .subscribe({
        next: (data) => {
          this.statsService.reviewStats.set(data);
          this.loading.set(false);
        },
        error: (err: unknown) => {
          this.loading.set(false);
          this.messageToastService.error('Error', 'Failed to retrieve MR review stats');
          console.error(err);
        },
      });
  }
}
