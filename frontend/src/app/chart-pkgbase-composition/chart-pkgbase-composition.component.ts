import { httpResource } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import { UIChart } from '@openng/optimus-ui/chart';
import { AppService } from '../app.service';
import { type ChartConfig, mochaPieChartOptions } from '../chart-config';
import { parseCount, resourceValue } from '../functions';
import { CATPPUCCIN_FLAVOURS } from '../theme';

const SINGLE_LABEL = 'Single package';
const SPLIT_LABEL = 'Split package members';

@Component({
  selector: 'chaotic-chart-pkgbase-composition',
  imports: [UIChart],
  templateUrl: './chart-pkgbase-composition.component.html',
  styleUrl: './chart-pkgbase-composition.component.css',
})
export class ChartPkgbaseCompositionComponent {
  private readonly appService = inject(AppService);

  private readonly resource = httpResource<{ type: string; count: string }[]>(() =>
    this.appService.getPkgbaseCompositionRequest(),
  );

  readonly loading = this.resource.isLoading;
  readonly hasData = computed(() => this.resource.hasValue());

  readonly chartConfig = computed<ChartConfig<'pie'>>(() => {
    const counts = new Map((resourceValue(this.resource) ?? []).map((row) => [row.type, parseCount(row.count)]));
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
