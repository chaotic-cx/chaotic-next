import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit, PLATFORM_ID } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { flavors } from '@catppuccin/palette';
import { MessageToastService } from '@garudalinux/core';
import { UIChart } from 'primeng/chart';
import { InputNumber } from 'primeng/inputnumber';
import { retry } from 'rxjs';
import { AppService } from '../app.service';

@Component({
  selector: 'chaotic-chart-builds-per-day',
  imports: [UIChart, FormsModule, InputNumber],
  templateUrl: './chart-builds-per-day.component.html',
  styleUrl: './chart-builds-per-day.component.css',
  providers: [MessageToastService, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartBuildsPerDayComponent implements OnInit {
  chartData: any;
  options: any;
  platformId = inject(PLATFORM_ID);
  days = 30;

  private readonly appService = inject(AppService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly messageToastService = inject(MessageToastService);
  private readonly datePipe = inject(DatePipe);

  ngOnInit(): void {
    this.getBuildsPerDay();
  }

  /**
   * Query the builds per day.
   */
  private getBuildsPerDay(): void {
    this.appService
      .getBuildsPerDay(this.days)
      .pipe(retry({ count: 3, delay: 5000 }))
      .subscribe({
        next: (data) => {
          this.initChart(data);
        },
        error: (err) => {
          this.messageToastService.error('Error', 'Failed to load builds per day data');
          console.error(err);
        },
        complete: () => this.cdr.markForCheck(),
      });
  }

  initChart(data: { day: string; count: string }[]): void {
    if (isPlatformBrowser(this.platformId)) {
      this.chartData = {
        labels: [],
        datasets: [
          {
            label: 'Builds per day',
            data: [],
            backgroundColor: flavors.mocha.colors.lavender.hex,
            borderColor: flavors.mocha.colors.lavender.hex,
            fill: false,
          },
        ],
      };

      for (const item of data) {
        const formattedDate = this.datePipe.transform(item.day, 'shortDate');
        this.chartData.labels.push(formattedDate || item.day);
        this.chartData.datasets[0].data.push(parseInt(item.count));
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

  onDaysChange(): void {
    this.getBuildsPerDay();
  }
}
