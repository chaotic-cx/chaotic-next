import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit, PLATFORM_ID } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { flavors } from '@catppuccin/palette';
import { MessageToastService } from '@garudalinux/core';
import { UIChart } from 'primeng/chart';
import { retry } from 'rxjs';
import { AppService } from '../app.service';
import { shuffleArray } from '../functions';
import { CatppuccinFlavors } from '../theme';
import { BuildStatus } from '@./shared-lib';

@Component({
  selector: 'chaotic-chart-average-build-time',
  imports: [UIChart, FormsModule],
  templateUrl: './chart-average-build-time.component.html',
  styleUrl: './chart-average-build-time.component.css',
  providers: [MessageToastService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartAverageBuildTimeComponent implements OnInit {
  chartData: any;
  options: any;
  platformId = inject(PLATFORM_ID);

  private readonly appService = inject(AppService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly messageToastService = inject(MessageToastService);

  ngOnInit(): void {
    this.getAverageBuildTimePerStatus();
  }

  /**
   * Query the average build time per status.
   */
  private getAverageBuildTimePerStatus(): void {
    this.appService
      .getAverageBuildTimePerStatus()
      .pipe(retry({ count: 3, delay: 5000 }))
      .subscribe({
        next: (data) => {
          this.initChart(data);
        },
        error: (err) => {
          this.messageToastService.error('Error', 'Failed to load average build time data');
          console.error(err);
        },
        complete: () => this.cdr.markForCheck(),
      });
  }

  initChart(data: { average_build_time: string; status: string }[]): void {
    if (isPlatformBrowser(this.platformId)) {
      // Filter out timed out builds
      const filteredData = data.filter((item) => parseInt(item.status) !== 4);

      this.chartData = {
        labels: [],
        datasets: [
          {
            data: [],
            label: 'Average build time (seconds)',
            backgroundColor: shuffleArray(CatppuccinFlavors),
          },
        ],
      };

      for (const item of filteredData) {
        this.chartData.labels.push(this.getStatusName(parseInt(item.status)));
        this.chartData.datasets[0].data.push(parseFloat(item.average_build_time));
      }

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

  private getStatusName(status: number): string {
    switch (status) {
      case BuildStatus.SUCCESS:
        return 'Success';
      case BuildStatus.ALREADY_BUILT:
        return 'Already Built';
      case BuildStatus.SKIPPED:
        return 'Skipped';
      case BuildStatus.FAILED:
        return 'Failed';
      case BuildStatus.TIMED_OUT:
        return 'Timed Out';
      case BuildStatus.CANCELED:
        return 'Canceled';
      case BuildStatus.CANCELED_REQUEUE:
        return 'Canceled Requeue';
      case BuildStatus.SOFTWARE_FAILURE:
        return 'Software Failure';
      default:
        return `Status ${status}`;
    }
  }
}
