import { ChangeDetectorRef, computed, Directive, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { translateSignal } from '@jsverse/transloco';
import { Table } from '@openng/optimus-ui/table';
import { injectActiveLanguage } from './pipes/active-language';

export interface PageReportValues {
  first: number;
  rows: number;
  total: number;
}

/**
 * Fills the "{first}–{last} of {totalRecords}" template with formatted numbers.
 * `first` is the zero-based offset of the page, as the table reports it.
 */
export function formatPageReport(
  template: string,
  values: PageReportValues,
  formatNumber: (value: number) => string,
): string {
  const firstShown = values.total > 0 ? values.first + 1 : 0;
  const lastShown = Math.min(values.first + values.rows, values.total);

  return template
    .replace('{first}', formatNumber(firstShown))
    .replace('{last}', formatNumber(lastShown))
    .replace('{totalRecords}', formatNumber(values.total));
}

/**
 * Shows the shared "first–last of total" page report in the paginator of a PrimeNG table.
 * The numbers follow the active language. With `chaoticTableFailed`, the paginator is hidden,
 * so a load error does not show "0–0 of 0".
 */
@Directive({
  selector: 'p-table[chaoticPageReport]',
})
export class TablePageReportDirective {
  private readonly table = inject(Table);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly template = translateSignal('tablePagination.pageReport');
  private readonly language = injectActiveLanguage();

  // Same names as the table inputs, so one binding feeds the table and this directive.
  readonly totalRecords = input(0);
  readonly rows = input(0);
  readonly chaoticTableFailed = input(false);

  private readonly first = signal(0);
  private readonly pageRows = signal<number | undefined>(undefined);

  private readonly report = computed(() => {
    const numberFormat = new Intl.NumberFormat(this.language());
    const values: PageReportValues = {
      first: this.first(),
      rows: this.pageRows() ?? this.rows(),
      total: this.totalRecords(),
    };

    return formatPageReport(this.template(), values, (value) => numberFormat.format(value));
  });

  constructor() {
    this.table.showCurrentPageReport = true;

    this.table.onLazyLoad.pipe(takeUntilDestroyed()).subscribe((event) => this.trackPage(event.first, event.rows));
    this.table.onPage.pipe(takeUntilDestroyed()).subscribe((event) => this.trackPage(event.first, event.rows));

    effect(() => {
      this.table.currentPageReportTemplate = this.report();
      this.table.paginator = !this.chaoticTableFailed();
      this.changeDetector.markForCheck();
    });
  }

  private trackPage(first: number | undefined, rows: number | null | undefined): void {
    this.first.set(first ?? 0);

    if (rows !== null && rows !== undefined) {
      this.pageRows.set(rows);
    }
  }
}
