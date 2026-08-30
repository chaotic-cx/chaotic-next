import { Component, computed, inject } from '@angular/core';
import { AppService } from '../../../../app.service';
import { parseCount } from '../../../../functions';
import { CATPPUCCIN_FLAVOURS } from '../../../../theme';
import { ChartCardComponent } from '../../chart-card/chart-card.component';
import { chartResource, type ChartConfig, mochaPieChartOptions } from '../../chart-config';

const SINGLE_LABEL = 'Single package';
const SPLIT_LABEL = 'Split package members';

@Component({
  selector: 'chaotic-chart-pkgbase-composition',
  imports: [ChartCardComponent],
  templateUrl: './chart-pkgbase-composition.component.html',
  styleUrl: './chart-pkgbase-composition.component.css',
})
export class ChartPkgbaseCompositionComponent {
  private readonly appService = inject(AppService);

  readonly chart = chartResource<{ type: string; count: string }[]>(() =>
    this.appService.getPkgbaseCompositionRequest(),
  );

  readonly chartConfig = computed<ChartConfig<'pie'>>(() => {
    const counts = new Map(this.chart.data().map((row) => [row.type, parseCount(row.count)]));
    return {
      data: {
        labels: [SINGLE_LABEL, SPLIT_LABEL],
        datasets: [
          {
            data: [counts.get('single') ?? 0, counts.get('split') ?? 0],
            label: 'Packages',
            backgroundColor: [CATPPUCCIN_FLAVOURS[0], CATPPUCCIN_FLAVOURS[1]],
          },
        ],
      },
      options: mochaPieChartOptions<'pie'>(),
    };
  });
}
