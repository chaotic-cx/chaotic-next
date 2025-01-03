import { ChangeDetectorRef, Component, effect, inject, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { AppService } from '../app.service';
import { UIChart } from 'primeng/chart';
import type { CountryRankList } from '@./shared-lib';
import { FormsModule } from '@angular/forms';
import { InputNumber } from 'primeng/inputnumber';
import { FluidModule } from 'primeng/fluid';
import { MessageToastService } from '@garudalinux/core';
import { BreakpointObserver } from '@angular/cdk/layout';
import { flavors } from '@catppuccin/palette';
import { CatppuccinFlavors } from '../theme';
import { shuffleArray } from '../functions';
import { retry } from 'rxjs';

@Component({
  selector: 'chaotic-chart-countries',
  imports: [CommonModule, UIChart, FormsModule, InputNumber, FluidModule],
  templateUrl: './chart-countries.component.html',
  styleUrl: './chart-countries.component.css',
  providers: [MessageToastService],
})
export class ChartCountriesComponent implements OnInit {
  chartData: any;
  options: any;
  platformId = inject(PLATFORM_ID);
  amount = signal<number>(15);

  private readonly appService = inject(AppService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly messageToastService = inject(MessageToastService);
  private readonly observer = inject(BreakpointObserver);

  countryRanks: CountryRankList = [];

  constructor() {
    effect(() => {
      this.initChart();
    });
  }

  ngOnInit(): void {
    this.observer.observe(['(max-width: 768px)']).subscribe((state) => {
      this.amount.set(state.matches ? 5 : 15);
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
          this.countryRanks = data;
          this.initChart();
        },
        error: (err) => {
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
      // @ts-ignore
      .map((char) => 127397 + char.charCodeAt());
    return String.fromCodePoint(...codePoints);
  }

  initChart(): void {
    if (isPlatformBrowser(this.platformId)) {
      const relevantData = this.countryRanks.slice(0, this.amount());
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
        this.chartData.labels.push(this.countryRanks[country].name);
        this.chartData.datasets[0].data.push(this.countryRanks[country].count);
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
