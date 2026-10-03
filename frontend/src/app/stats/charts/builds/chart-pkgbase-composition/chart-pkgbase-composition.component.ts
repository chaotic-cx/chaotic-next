import { Component, computed, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { AppService } from '../../../../app.service';
import { parseCount } from '../../../../functions';
import { injectActiveTranslation } from '../../../../i18n/active-translation';
import { CATPPUCCIN_FLAVOURS } from '../../../../theme';
import { ChartCardComponent } from '../../chart-card/chart-card.component';
import { chartResource, type ChartConfig, mochaPieChartOptions } from '../../chart-config';

@Component({
  selector: 'chaotic-chart-pkgbase-composition',
  imports: [ChartCardComponent],
  templateUrl: './chart-pkgbase-composition.component.html',
  styleUrl: './chart-pkgbase-composition.component.css',
})
export class ChartPkgbaseCompositionComponent {
  private readonly appService = inject(AppService);
  private readonly transloco = inject(TranslocoService);

  private readonly activeTranslation = injectActiveTranslation();

  readonly chart = chartResource<{ type: string; count: string }[]>(() =>
    this.appService.getPkgbaseCompositionRequest(),
  );

  readonly chartConfig = computed<ChartConfig<'pie'>>(() => {
    this.activeTranslation();

    const counts = new Map(this.chart.data().map((row) => [row.type, parseCount(row.count)]));
    return {
      data: {
        labels: [
          this.transloco.translate('stats.charts.pkgbaseComposition.single'),
          this.transloco.translate('stats.charts.pkgbaseComposition.split'),
        ],
        datasets: [
          {
            data: [counts.get('single') ?? 0, counts.get('split') ?? 0],
            label: this.transloco.translate('stats.charts.packages'),
            backgroundColor: [CATPPUCCIN_FLAVOURS[0], CATPPUCCIN_FLAVOURS[1]],
          },
        ],
      },
      options: mochaPieChartOptions<'pie'>(),
    };
  });
}
