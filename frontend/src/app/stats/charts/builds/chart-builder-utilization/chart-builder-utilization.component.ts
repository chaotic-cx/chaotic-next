import { httpResource } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import { AppService, ALL_TIME_DAYS } from '../../../../app.service';
import { resourceValue } from '../../../../functions';
import { StatsService } from '../../../stats.service';

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
    if (row.count > max) max = row.count;
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
  imports: [],
  templateUrl: './chart-builder-utilization.component.html',
  styleUrl: './chart-builder-utilization.component.css',
})
export class ChartBuilderUtilizationComponent {
  private readonly appService = inject(AppService);
  private readonly statsService = inject(StatsService);

  readonly days = computed(() => this.statsService.timeRangeDays() ?? ALL_TIME_DAYS);

  private readonly resource = httpResource<BuilderUtilizationRowDto[]>(() =>
    this.appService.getBuilderUtilizationResourceRequest(this.days()),
  );

  readonly loading = this.resource.isLoading;
  readonly hasData = computed(() => this.resource.hasValue());

  readonly grid = computed(() => buildUtilizationGrid(resourceValue(this.resource) ?? []));

  readonly hourLabels = computed(() =>
    Array.from({ length: HOURS_PER_DAY }, (unused, hour) => (hour % 3 === 0 ? String(hour) : '')),
  );

  protected cellBackground(count: number): string {
    if (count <= 0) return 'var(--ctp-mocha-surface0)';
    return `color-mix(in srgb, var(--ctp-mocha-mauve) ${utilizationShade(count, this.grid().max)}%, transparent)`;
  }

  protected rangeLabel(): string {
    const days = this.days();
    return days >= ALL_TIME_DAYS ? 'the whole recorded history' : `the last ${days} day${days === 1 ? '' : 's'}`;
  }

  protected cellTitle(row: UtilizationRow, cell: UtilizationCell): string {
    const perDay = (cell.count / this.days()).toFixed(1);
    return `${row.builder} · ${String(cell.hour).padStart(2, '0')}:00 UTC — ${perDay} builds/day`;
  }
}
