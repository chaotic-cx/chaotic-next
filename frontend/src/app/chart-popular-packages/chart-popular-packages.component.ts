import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { flavors } from '@catppuccin/palette';
import { MessageToastService } from '@garudalinux/core';
import { UIChart } from '@openng/optimus-ui/chart';
import { InputNumber } from '@openng/optimus-ui/inputnumber';
import { retry } from 'rxjs';
import { AppService } from '../app.service';
import { shuffleArray } from '../functions';
import { CATPPUCCIN_FLAVOURS } from '../theme';

@Component({
  selector: 'chaotic-chart-popular-packages',
  imports: [UIChart, InputNumber, FormsModule],
  templateUrl: './chart-popular-packages.component.html',
  styleUrl: './chart-popular-packages.component.css',
  providers: [MessageToastService],
})
export class ChartPopularPackagesComponent implements OnInit {
  private readonly appService = inject(AppService);
  private readonly messageToastService = inject(MessageToastService);

  readonly chartConfig = signal<{ data: any; options: any } | null>(null);
  readonly loading = signal(true);
  amount = 20;

  ngOnInit(): void {
    this.getPopularPackages();
  }

  /**
   * Query the popular packages.
   */
  private getPopularPackages(): void {
    this.appService
      .getPopularPackages(this.amount)
      .pipe(retry({ count: 3, delay: 5000 }))
      .subscribe({
        next: (data) => {
          this.chartConfig.set(this.buildChartConfig(data));
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.messageToastService.error('Error', 'Failed to load popular packages data');
          console.error(err);
        },
      });
  }

  private buildChartConfig(data: { pkgbase_pkgname: string; count: string }[]): { data: any; options: any } {
    const labels: string[] = [];
    const values: number[] = [];
    for (const item of data) {
      labels.push(item.pkgbase_pkgname);
      values.push(parseInt(item.count));
    }

    return {
      data: {
        labels,
        datasets: [
          {
            data: values,
            label: 'Build count',
            backgroundColor: shuffleArray(CATPPUCCIN_FLAVOURS),
          },
        ],
      },
      options: {
        indexAxis: 'y',
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

  onAmountChange(): void {
    this.loading.set(true);
    this.getPopularPackages();
  }
}
