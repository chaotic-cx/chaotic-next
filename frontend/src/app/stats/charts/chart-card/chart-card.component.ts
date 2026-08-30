import { Component, input } from '@angular/core';
import { UIChart } from '@openng/optimus-ui/chart';
import type { ChartData, ChartType } from 'chart.js';

@Component({
  selector: 'chaotic-chart-card',
  imports: [UIChart],
  templateUrl: './chart-card.component.html',
  styleUrl: './chart-card.component.css',
})
export class ChartCardComponent {
  readonly data = input.required<ChartData>();
  readonly options = input.required<unknown>();
  readonly hasData = input.required<boolean>();
  readonly loading = input.required<boolean>();
  readonly type = input<ChartType>('line');
  readonly containerClass = input('card relative flex h-[20rem] sm:h-[18rem] justify-center');
  readonly height = input<number>();
  readonly chartClass = input('w-full h-full');
}
