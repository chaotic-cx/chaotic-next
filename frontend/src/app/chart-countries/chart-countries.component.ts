import { BreakpointObserver } from '@angular/cdk/layout';
import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  effect,
  inject,
  OnInit,
  PLATFORM_ID,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { flavors } from '@catppuccin/palette';
import { MessageToastService } from '@garudalinux/core';
import { UIChart } from 'primeng/chart';
import { FluidModule } from 'primeng/fluid';
import { InputNumber } from 'primeng/inputnumber';
import { retry } from 'rxjs';
import { AppService } from '../app.service';
import { shuffleArray } from '../functions';
import { CatppuccinFlavors } from '../theme';
import { PackageStatsService } from '../package-stats/package-stats.service';

@Component({
  selector: 'chaotic-chart-countries',
  imports: [UIChart, FormsModule, InputNumber, FluidModule],
  templateUrl: './chart-countries.component.html',
  styleUrl: './chart-countries.component.css',
  providers: [MessageToastService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartCountriesComponent implements OnInit {
  chartData: any;
  options: any;
  platformId = inject(PLATFORM_ID);

  private readonly appService = inject(AppService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly messageToastService = inject(MessageToastService);
  private readonly observer = inject(BreakpointObserver);

  protected readonly packageStatsService = inject(PackageStatsService);

  constructor() {
    effect(() => {
      this.initChart();
    });
  }

  ngOnInit(): void {
    this.observer.observe(['(max-width: 768px)']).subscribe((state) => {
      this.packageStatsService.countryRanksRange.set(state.matches ? 5 : 15);
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
          this.packageStatsService.countryRanksMetrics.set(data);
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
      const relevantData = this.packageStatsService
        .countryRanksMetrics()
        .slice(0, this.packageStatsService.countryRanksRange());
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
        this.chartData.labels.push(this.packageStatsService.countryRanksMetrics()[country].name);
        this.chartData.datasets[0].data.push(this.packageStatsService.countryRanksMetrics()[country].count);
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
