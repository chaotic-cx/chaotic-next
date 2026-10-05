import { Component, computed, inject } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { AppService, ALL_TIME_DAYS } from '../../../../app.service';
import { injectActiveTranslation } from '../../../../i18n/active-translation';
import { StatsService } from '../../../stats.service';
import { LoadErrorComponent } from '../../../../load-error/load-error.component';
import { chartResource } from '../../chart-config';

export interface BuilderUtilizationRowDto {
  builder: string;
  hour: number;
  count: number;
}

export interface UtilizationCell {
  hour: number;
  count: number;
}

export interface UtilizationRow {
  builder: string;
  cells: UtilizationCell[];
}

export interface UtilizationGrid {
  rows: UtilizationRow[];
  max: number;
}

const HOURS_PER_DAY = 24;
const HOUR_DIGITS = 2;
const PER_DAY_DECIMALS = 1;
const HOUR_LABEL_STEP = 3;

function hourAxisLabel(hour: number): string {
  if (hour % HOUR_LABEL_STEP === 0) return String(hour);

  return '';
}

const HOUR_LABELS: readonly string[] = Array.from({ length: HOURS_PER_DAY }, (unused, hour) => hourAxisLabel(hour));

/**
 * Turns sparse builder/hour buckets into a dense matrix: one row per builder
 * (alphabetical), 24 zero-filled hour cells each, plus the peak bucket value.
 */
export function buildUtilizationGrid(
  rows: BuilderUtilizationRowDto[],
  hoursPerDay: number = HOURS_PER_DAY,
): UtilizationGrid {
  const byKey = new Map<string, number>();
  let max = 0;
  for (const row of rows) {
    byKey.set(`${row.builder}:${row.hour}`, row.count);
    if (row.count > max) {
      max = row.count;
    }
  }
  const builders = [...new Set(rows.map((row) => row.builder))].sort((left, right) => left.localeCompare(right));
  return {
    max,
    rows: builders.map((builder) => ({
      builder,
      cells: Array.from({ length: hoursPerDay }, (unused, hour) => ({
        hour,
        count: byKey.get(`${builder}:${hour}`) ?? 0,
      })),
    })),
  };
}

export function utilizationShade(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0;
  return Math.round(15 + 85 * (count / max));
}

@Component({
  selector: 'chaotic-chart-builder-utilization',
  imports: [LoadErrorComponent, TranslocoDirective],
  templateUrl: './chart-builder-utilization.component.html',
  styleUrl: './chart-builder-utilization.component.css',
})
export class ChartBuilderUtilizationComponent {
  private readonly appService = inject(AppService);
  private readonly statsService = inject(StatsService);
  private readonly transloco = inject(TranslocoService);

  private readonly activeTranslation = injectActiveTranslation();

  readonly days = computed(() => this.statsService.timeRangeDays() ?? ALL_TIME_DAYS);

  readonly chart = chartResource<BuilderUtilizationRowDto[]>(() =>
    this.appService.getBuilderUtilizationResourceRequest(this.days()),
  );

  readonly grid = computed(() => buildUtilizationGrid(this.chart.data()));

  protected readonly hourLabels = HOUR_LABELS;

  protected cellBackground(count: number): string {
    if (count <= 0) return 'var(--catppuccin-color-surface0)';
    return `color-mix(in srgb, var(--catppuccin-color-mauve) ${utilizationShade(count, this.grid().max)}%, transparent)`;
  }

  protected readonly rangeLabel = computed(() => {
    this.activeTranslation();

    const days = this.days();
    if (days >= ALL_TIME_DAYS) return this.transloco.translate('stats.charts.builderUtilization.rangeAll');

    if (days === 1) return this.transloco.translate('stats.charts.builderUtilization.rangeLastOne', { days });

    return this.transloco.translate('stats.charts.builderUtilization.rangeLastOther', { days });
  });

  protected formatHour(hour: number): string {
    return String(hour).padStart(HOUR_DIGITS, '0');
  }

  protected buildsPerDay(cell: UtilizationCell): string {
    return (cell.count / this.days()).toFixed(PER_DAY_DECIMALS);
  }
}
