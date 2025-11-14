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

@Component({
  selector: 'chaotic-chart-builders-amount',
  imports: [UIChart, FormsModule],
  templateUrl: './chart-builders-amount.component.html',
  styleUrl: './chart-builders-amount.component.css',
  providers: [MessageToastService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartBuildersAmountComponent implements OnInit {
  chartData: any;
  options: any;
  platformId = inject(PLATFORM_ID);

  private readonly appService = inject(AppService);
  private readonly cdr = inject(ChangeDetectorRef);
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
          this.initChart(data);
        },
        error: (err) => {
          this.messageToastService.error('Error', 'Failed to load builders amount data');
          console.error(err);
        },
        complete: () => this.cdr.markForCheck(),
      });
  }

  initChart(data: { name: string; count: string }[]): void {
    if (isPlatformBrowser(this.platformId)) {
      this.chartData = {
        labels: [],
        datasets: [
          {
            data: [],
            label: 'Builds per builder',
            backgroundColor: shuffleArray(CatppuccinFlavors),
          },
        ],
      };

      for (const item of data) {
        this.chartData.labels.push(item.name);
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
}
