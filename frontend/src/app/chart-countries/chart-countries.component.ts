import { BreakpointObserver } from '@angular/cdk/layout';
import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectorRef, Component, effect, inject, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { flavors } from '@catppuccin/palette';
import { MessageToastService } from '@garudalinux/core';
import { UIChart } from '@openng/optimus-ui/chart';
import { FluidModule } from '@openng/optimus-ui/fluid';
import { InputNumber } from '@openng/optimus-ui/inputnumber';
import { retry } from 'rxjs';
import { AppService } from '../app.service';
import { shuffleArray } from '../functions';
import { StatsService } from '../stats/stats.service';
import { CatppuccinFlavors } from '../theme';

@Component({
  selector: 'chaotic-chart-countries',
  imports: [UIChart, FormsModule, InputNumber, FluidModule],
  templateUrl: './chart-countries.component.html',
  styleUrl: './chart-countries.component.css',
  providers: [MessageToastService],
})
export class ChartCountriesComponent implements OnInit {
  chartData: any;
  options: any;
  loading = signal(true);
  platformId = inject(PLATFORM_ID);

  private readonly appService = inject(AppService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly messageToastService = inject(MessageToastService);
  private readonly observer = inject(BreakpointObserver);

  protected readonly statsService = inject(StatsService);

  constructor() {
    effect(() => {
      this.initChart();
    });
  }

  ngOnInit(): void {
    this.observer.observe(['(max-width: 768px)']).subscribe((state) => {
      this.statsService.countryRanksRange.set(state.matches ? 5 : 15);
      this.cdr.markForCheck();
    });
    this.getCountryRanks();
  }

  /**
   * Query the country ranks.
   */
  private getCountryRanks(): void {
    this.appService
      .getCountryRanks()
      .pipe(retry({ count: 3, delay: 5000 }))
      .subscribe({
        next: (data) => {
          for (const country of data) {
            country.name = `${country.name}  ${this.countryCode2Flag(country.name)}`;
          }
          this.statsService.countryRanksMetrics.set(data);
          this.loading.set(false);
          this.initChart();
        },
        error: (err) => {
          this.messageToastService.error('Error', 'Failed to load country chart data');
          console.error(err);
        },
        complete: () => this.cdr.markForCheck(),
      });
  }

  /**
   * Transform a country code to a flag emoji.
   * Seen here: https://dev.to/jorik/country-code-to-flag-emoji-a21
   * @returns The corresponding flag as emoji.
   */
  private countryCode2Flag(countryCode: string): string {
    const codePoints = countryCode
      .toUpperCase()
      .split('')
      // @ts-expect-error works just as expected
      .map((char) => 127397 + char.charCodeAt());
    return String.fromCodePoint(...codePoints);
  }

  initChart(): void {
    if (isPlatformBrowser(this.platformId)) {
      const relevantData = this.statsService.countryRanksMetrics().slice(0, this.statsService.countryRanksRange());
      this.chartData = {
        labels: [],
        datasets: [
          {
            data: [],
            label: 'Router hits',
            backgroundColor: shuffleArray(CatppuccinFlavors),
          },
        ],
      };
      for (const country in relevantData) {
        this.chartData.labels.push(this.statsService.countryRanksMetrics()[country].name);
        this.chartData.datasets[0].data.push(this.statsService.countryRanksMetrics()[country].count);
      }

      this.options = {
        chartArea: { right: 20, top: 0, width: '75%', height: '100%' },
        plugins: {
          legend: {
            labels: {
              usePointStyle: false,
              color: flavors.mocha.colors.text.hex,
              family: 'Inter, Helvetica, Arial, sans-serif',
            },
            position: 'right',
          },
        },
      };

      this.cdr.markForCheck();
    }
  }
}
