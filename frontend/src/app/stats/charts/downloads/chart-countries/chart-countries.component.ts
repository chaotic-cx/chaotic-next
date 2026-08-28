import { BreakpointObserver } from '@angular/cdk/layout';
import { httpResource } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { UIChart } from '@openng/optimus-ui/chart';
import { FluidModule } from '@openng/optimus-ui/fluid';
import { InputNumber } from '@openng/optimus-ui/inputnumber';
import { AppService } from '../../../../app.service';
import { resourceValue, shuffleArray } from '../../../../functions';
import { CATPPUCCIN_FLAVOURS } from '../../../../theme';
import { StatsService } from '../../../stats.service';
import { type ChartConfig, mochaPieChartOptions } from '../../chart-config';

@Component({
  selector: 'chaotic-chart-countries',
  imports: [UIChart, FormsModule, InputNumber, FluidModule],
  templateUrl: './chart-countries.component.html',
  styleUrl: './chart-countries.component.css',
})
export class ChartCountriesComponent {
  private readonly appService = inject(AppService);
  private readonly observer = inject(BreakpointObserver);
  protected readonly statsService = inject(StatsService);

  private readonly resource = httpResource<{ name: string; count: number }[]>(() =>
    this.appService.getCountryRanksResourceRequest(
      this.statsService.timeRangeDays() ?? undefined,
      this.statsService.selectedRepo() || undefined,
    ),
  );

  readonly loading = this.resource.isLoading;

  readonly hasData = computed(() => this.resource.hasValue());

  readonly chartConfig = computed<ChartConfig<'pie'>>(() => {
    const all = resourceValue(this.resource) ?? [];
    const relevantData = all.slice(0, this.statsService.countryRanksRange());
    const labels: string[] = [];
    const data: number[] = [];
    for (const country of relevantData) {
      labels.push(`${country.name}  ${this.countryCode2Flag(country.name)}`);
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
      options: mochaPieChartOptions(),
    };
  });

  constructor() {
    this.observer
      .observe(['(max-width: 768px)'])
      .pipe(takeUntilDestroyed())
      .subscribe((state) => {
        this.statsService.countryRanksRange.set(state.matches ? 5 : 15);
      });
  }

  private countryCode2Flag(countryCode: string): string {
    // Flag emojis are regional indicator symbols starting at U+1F1E6 ('A' is code 65).
    const flagEmojiOffset = 0x1f1e6 - 65;
    const codePoints = countryCode
      .toUpperCase()
      .split('')
      .map((char) => flagEmojiOffset + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  }
}
