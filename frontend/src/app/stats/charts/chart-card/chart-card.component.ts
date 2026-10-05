import { Component, computed, input, output, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { UIChart } from '@openng/optimus-ui/chart';
import type { ChartData, ChartType } from 'chart.js';
import { EmptyStateComponent } from '../../../empty-state/empty-state.component';
import { LoadErrorComponent } from '../../../load-error/load-error.component';
import { MISSING_VALUE } from '../../../table-columns/missing-value';
import { SlowLoadingHintComponent } from '../../../ui-states/slow-loading-hint.component';
import { applyChartTheme } from '../chart-theme';

export interface ChartTableRow {
  label: string;
  values: string[];
}

export interface ChartTable {
  series: string[];
  rows: ChartTableRow[];
}

function chartLabelText(label: unknown): string {
  if (Array.isArray(label)) return label.join(' ');

  return String(label ?? '');
}

// A missing data point is unknown, which is not the same as zero.

function chartValueText(value: unknown): string {
  if (value === null || value === undefined) return MISSING_VALUE;

  if (typeof value === 'number') return value.toLocaleString();

  if (typeof value === 'object' && 'y' in value) return chartValueText(value.y);

  return String(value);
}

/**
 * Turns chart data into rows of plain text, one row per label and one column per dataset.
 * Screen readers and keyboard users read this table instead of the canvas.
 */
export function chartTable(data: ChartData): ChartTable {
  const datasets = data.datasets;
  const series: string[] = [];
  for (const dataset of datasets) {
    series.push(dataset.label ?? '');
  }

  const rows: ChartTableRow[] = [];
  const labels = data.labels ?? [];
  for (let index = 0; index < labels.length; index++) {
    const values: string[] = [];
    for (const dataset of datasets) {
      values.push(chartValueText(dataset.data[index]));
    }

    rows.push({ label: chartLabelText(labels[index]), values });
  }

  return { series, rows };
}

@Component({
  selector: 'chaotic-chart-card',
  imports: [UIChart, LoadErrorComponent, EmptyStateComponent, SlowLoadingHintComponent, TranslocoDirective],
  templateUrl: './chart-card.component.html',
  styleUrl: './chart-card.component.css',
})
export class ChartCardComponent {
  readonly data = input.required<ChartData>();
  readonly options = input.required<unknown>();
  readonly hasData = input.required<boolean>();
  readonly loading = input.required<boolean>();
  readonly failed = input(false);
  readonly retry = output();
  readonly type = input<ChartType>('line');
  readonly containerClass = input('card relative flex h-[20rem] sm:h-[18rem] justify-center');
  readonly height = input<number>();
  readonly chartClass = input('w-full h-full');
  readonly label = input<string>();

  protected readonly showTable = signal(false);

  /**
   * The chart redraws on every new object. JSON compares by value; Chart.js mutates what it gets,
   * so it receives a parsed copy. Chart inputs here hold plain values only.
   */
  private readonly dataJson = computed(() => JSON.stringify(this.data()));
  private readonly optionsJson = computed(() => JSON.stringify(this.options()));

  protected readonly chartData = computed<ChartData>(() => JSON.parse(this.dataJson()));
  protected readonly chartOptions = computed<unknown>(() => JSON.parse(this.optionsJson()));

  protected readonly table = computed(() => chartTable(this.chartData()));

  // Falls back to the dataset names when the parent passes no label.
  protected readonly title = computed(() => {
    const label = this.label();
    if (label) return label;

    return this.table()
      .series.filter((name) => name !== '')
      .join(', ');
  });

  constructor() {
    applyChartTheme();
  }

  protected toggleTable(): void {
    this.showTable.set(!this.showTable());
  }
}
