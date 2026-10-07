import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { TranslocoService } from '@jsverse/transloco';
import { InputNumber } from '@openng/optimus-ui/inputnumber';
import { AppService } from '../../../../app.service';
import { injectActiveTranslation } from '../../../../i18n/active-translation';
import { seriesColors } from '../../../../theme';
import { StatsService } from '../../../stats.service';
import { ChartCardComponent } from '../../chart-card/chart-card.component';
import { chartResource, type ChartConfig, pieChartOptions } from '../../chart-config';

const MAX_NAME_LENGTH = 50;

/** First parenthesized comment naming the platform, e.g. `(X11; Linux x86_64)`. */
const PLATFORM_COMMENT_PATTERN = /\([^()]*linux[^()]*\)/i;

/**
 * User agents carry platform and trailer tokens nobody reads on a chart
 * (`pacman/7.1.0 (Linux x86_64) libalpm/15.0.0`). Everything runs on Linux,
 * so the platform comment and anything behind it goes. Names without a
 * platform comment keep the plain length truncation.
 */
export function shortenUserAgentName(name: string): string {
  const platformComment = PLATFORM_COMMENT_PATTERN.exec(name);
  if (platformComment) return name.substring(0, platformComment.index).trimEnd();
  return name.length > MAX_NAME_LENGTH ? `${name.substring(0, MAX_NAME_LENGTH)}...` : name;
}

@Component({
  selector: 'chaotic-chart-useragent',
  imports: [ChartCardComponent, InputNumber, FormsModule],
  templateUrl: './chart-useragent.component.html',
  styleUrl: './chart-useragent.component.css',
})
export class ChartUseragentComponent {
  private readonly appService = inject(AppService);
  private readonly observer = inject(BreakpointObserver);
  protected readonly statsService = inject(StatsService);
  private readonly transloco = inject(TranslocoService);

  private readonly activeTranslation = injectActiveTranslation();

  readonly chart = chartResource<{ name: string; count: number }[]>(() =>
    this.appService.getUserAgentsResourceRequest(
      this.statsService.timeRangeDays() ?? undefined,
      this.statsService.selectedRepo() || undefined,
    ),
  );

  readonly chartConfig = computed<ChartConfig<'pie'>>(() => {
    this.activeTranslation();

    // Don't display more than 30 user agents and shorten overly long ones.
    const maxUserAgents = 30;
    const relevantData = this.chart
      .data()
      .slice(0, Math.min(maxUserAgents, this.statsService.userAgentMetricRange()))
      .map((entry) => ({
        name: shortenUserAgentName(entry.name),
        count: entry.count,
      }));

    const labels: string[] = [];
    const data: number[] = [];
    for (const entry of relevantData) {
      labels.push(entry.name);
      data.push(entry.count);
    }

    return {
      data: {
        labels,
        datasets: [
          {
            data,
            label: this.transloco.translate('stats.charts.routerHits'),
            backgroundColor: seriesColors(),
          },
        ],
      },
      options: pieChartOptions(),
    };
  });

  constructor() {
    this.observer
      .observe(['(max-width: 768px)'])
      .pipe(takeUntilDestroyed())
      .subscribe((state) => {
        this.statsService.userAgentMetricRange.set(state.matches ? 5 : 10);
      });
  }
}
