import { ChangeDetectorRef, Component, effect, inject, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { AppService } from '../app.service';
import { UIChart } from 'primeng/chart';
import type { CountryRankList } from '@./shared-lib';
import { FormsModule } from '@angular/forms';
import { InputNumber } from 'primeng/inputnumber';
import { FloatLabel } from 'primeng/floatlabel';
import { MessageService } from 'primeng/api';

@Component({
  selector: 'chaotic-chart-countries',
  imports: [CommonModule, UIChart, FormsModule, InputNumber, FloatLabel],
  templateUrl: './chart-countries.component.html',
  styleUrl: './chart-countries.component.css',
})
export class ChartCountriesComponent implements OnInit {
  chartData: any;
  options: any;
  platformId = inject(PLATFORM_ID);
  amount = signal<number>(15);

  countryRanks: CountryRankList = [];

  constructor(
    private appService: AppService,
    private cdr: ChangeDetectorRef,
    private messageService: MessageService,
  ) {
    effect(() => {
      this.initChart();
    });
  }

  ngOnInit(): void {
    this.getCountryRanks();
  }
  /**
   * Query the country ranks.
   */
  private getCountryRanks(): void {
    this.appService.getCountryRanks().subscribe({
      next: (data) => {
        for (const country of data) {
          country.name = `${country.name}  ${this.countryCode2Flag(country.name)}`;
        }
        this.countryRanks = data;
        this.initChart();
      },
      error: (err) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load country chart data',
        });
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
      const documentStyle: CSSStyleDeclaration = getComputedStyle(document.documentElement);
      const textColor: string = documentStyle.color;
      const relevantData = this.countryRanks.slice(0, this.amount());
      this.chartData = {
        labels: [],
        datasets: [
          {
            data: [],
            label: 'Country',
          },
        ],
      };
      for (const country in relevantData) {
        this.chartData.labels.push(this.countryRanks[country].name);
        this.chartData.datasets[0].data.push(this.countryRanks[country].count);
      }

      this.options = {
        plugins: {
          legend: {
            labels: {
              usePointStyle: true,
              color: textColor,
            },
          },
        },
      };
      this.cdr.markForCheck();
    }
  }
}
