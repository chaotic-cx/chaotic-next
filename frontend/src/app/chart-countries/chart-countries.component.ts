import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
import { CATPPUCCIN_FLAVOURS } from '../theme';

interface ChartConfig {
  data: any;
  options: any;
}

@Component({
  selector: 'chaotic-chart-countries',
  imports: [UIChart, FormsModule, InputNumber, FluidModule],
  templateUrl: './chart-countries.component.html',
  styleUrl: './chart-countries.component.css',
  providers: [MessageToastService],
})
export class ChartCountriesComponent implements OnInit {
  private readonly appService = inject(AppService);
  private readonly messageToastService = inject(MessageToastService);
  private readonly observer = inject(BreakpointObserver);
  protected readonly statsService = inject(StatsService);

  readonly chartConfig = computed<ChartConfig>(() => {
    const relevantData = this.statsService.countryRanksMetrics().slice(0, this.statsService.countryRanksRange());
    const labels: string[] = [];
    const data: number[] = [];
    for (const country of relevantData) {
      labels.push(country.name);
      data.push(country.count);
    }

    return {
      data: {
        labels,
        datasets: [
          {
            data,
            label: 'Router hits',
            backgroundColor: shuffleArray(CATPPUCCIN_FLAVOURS),
          },
        ],
      },
      options: {
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
      },
    };
  });

  readonly loading = signal(true);

  constructor() {
    this.observer
      .observe(['(max-width: 768px)'])
      .pipe(takeUntilDestroyed())
      .subscribe((state) => {
        this.statsService.countryRanksRange.set(state.matches ? 5 : 15);
      });
  }

  ngOnInit(): void {
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
        },
        error: (err) => {
          this.loading.set(false);
          this.messageToastService.error('Error', 'Failed to load country chart data');
          console.error(err);
        },
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
}
