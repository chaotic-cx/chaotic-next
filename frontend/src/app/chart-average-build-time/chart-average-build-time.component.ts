import { BuildStatus } from '@./shared-lib';
import { Component, inject, OnInit, signal } from '@angular/core';
import { flavors } from '@catppuccin/palette';
import { MessageToastService } from '@garudalinux/core';
import { UIChart } from '@openng/optimus-ui/chart';
import { retry } from 'rxjs';
import { AppService } from '../app.service';
import { shuffleArray } from '../functions';
import { CATPPUCCIN_FLAVOURS } from '../theme';

@Component({
  selector: 'chaotic-chart-average-build-time',
  imports: [UIChart],
  templateUrl: './chart-average-build-time.component.html',
  styleUrl: './chart-average-build-time.component.css',
  providers: [MessageToastService],
})
export class ChartAverageBuildTimeComponent implements OnInit {
  private readonly appService = inject(AppService);
  private readonly messageToastService = inject(MessageToastService);

  readonly chartConfig = signal<{ data: any; options: any } | null>(null);
  readonly loading = signal(true);

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
          this.chartConfig.set(this.buildChartConfig(data));
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.messageToastService.error('Error', 'Failed to load average build time data');
          console.error(err);
        },
      });
  }

  private buildChartConfig(data: { average_build_time: string; status: string }[]): { data: any; options: any } {
    // Filter out timed out builds
    const filteredData = data.filter((item) => parseInt(item.status) !== 4);

    const labels: string[] = [];
    const values: number[] = [];
    for (const item of filteredData) {
      labels.push(this.getStatusName(parseInt(item.status)));
      values.push(parseFloat(item.average_build_time));
    }

    return {
      data: {
        labels,
        datasets: [
          {
            data: values,
            label: 'Average build time (seconds)',
            backgroundColor: shuffleArray(CATPPUCCIN_FLAVOURS),
          },
        ],
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
