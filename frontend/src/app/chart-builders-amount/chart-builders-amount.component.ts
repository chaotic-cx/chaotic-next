import { Component, inject, signal, OnInit } from '@angular/core';
import { flavors } from '@catppuccin/palette';
import { MessageToastService } from '@garudalinux/core';
import { UIChart } from '@openng/optimus-ui/chart';
import { retry } from 'rxjs';
import { AppService } from '../app.service';
import { shuffleArray } from '../functions';
import { CatppuccinFlavors } from '../theme';

@Component({
  selector: 'chaotic-chart-builders-amount',
  imports: [UIChart],
  templateUrl: './chart-builders-amount.component.html',
  styleUrl: './chart-builders-amount.component.css',
  providers: [MessageToastService],
})
export class ChartBuildersAmountComponent implements OnInit {
  readonly chartConfig = signal<{ data: any; options: any } | null>(null);
  readonly loading = signal(true);

  private readonly appService = inject(AppService);
  private readonly messageToastService = inject(MessageToastService);

  ngOnInit(): void {
    this.getBuildersAmount();
  }

  /**
   * Query the builders and their build amounts.
   */
  private getBuildersAmount(): void {
    this.appService
      .getBuildersAmount()
      .pipe(retry({ count: 3, delay: 5000 }))
      .subscribe({
        next: (data) => {
          this.chartConfig.set(this.buildChartConfig(data));
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.messageToastService.error('Error', 'Failed to load builders amount data');
          console.error(err);
        },
      });
  }

  private buildChartConfig(data: { name: string; count: string }[]): { data: any; options: any } {
    const labels: string[] = [];
    const values: number[] = [];
    for (const item of data) {
      labels.push(item.name);
      values.push(parseInt(item.count));
    }

    return {
      data: {
        labels,
        datasets: [
          {
            data: values,
            label: 'Builds per builder',
            backgroundColor: shuffleArray(CatppuccinFlavors),
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
}
