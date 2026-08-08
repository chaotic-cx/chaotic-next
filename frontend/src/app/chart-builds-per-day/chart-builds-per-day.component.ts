import { DatePipe } from '@angular/common';
import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { flavors } from '@catppuccin/palette';
import { MessageToastService } from '@garudalinux/core';
import { UIChart } from '@openng/optimus-ui/chart';
import { InputNumber } from '@openng/optimus-ui/inputnumber';
import { retry } from 'rxjs';
import { AppService } from '../app.service';

@Component({
  selector: 'chaotic-chart-builds-per-day',
  imports: [UIChart, FormsModule, InputNumber],
  templateUrl: './chart-builds-per-day.component.html',
  styleUrl: './chart-builds-per-day.component.css',
  providers: [MessageToastService, DatePipe],
})
export class ChartBuildsPerDayComponent implements OnInit {
  private readonly appService = inject(AppService);
  private readonly messageToastService = inject(MessageToastService);
  private readonly datePipe = inject(DatePipe);

  readonly chartConfig = signal<{ data: any; options: any } | null>(null);
  readonly loading = signal(true);
  days = 30;

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
          this.chartConfig.set(this.buildChartConfig(data));
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.messageToastService.error('Error', 'Failed to load builds per day data');
          console.error(err);
        },
      });
  }

  private buildChartConfig(data: { day: string; count: string }[]): { data: any; options: any } {
    const labels: string[] = [];
    const values: number[] = [];
    for (const item of data) {
      const formattedDate = this.datePipe.transform(item.day, 'shortDate');
      labels.push(formattedDate || item.day);
      values.push(parseInt(item.count));
    }

    return {
      data: {
        labels,
        datasets: [
          {
            label: 'Builds per day',
            data: values,
            backgroundColor: flavors.mocha.colors.lavender.hex,
            borderColor: flavors.mocha.colors.lavender.hex,
            fill: false,
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

  onDaysChange(): void {
    this.loading.set(true);
    this.getBuildsPerDay();
  }
}
