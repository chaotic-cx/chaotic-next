import { DatePipe } from '@angular/common';
import { HttpParams, httpResource, type HttpResourceRequest } from '@angular/common/http';
import { computed, effect } from '@angular/core';
import type { Chart, ChartData, ChartOptions, ChartType } from 'chart.js';
import { resourceFailed, resourceValue } from '../../functions';
import { seriesColor, themePalette } from '../../theme';
import { chartColorOptions, chartGridColor, chartTickColor } from './chart-theme';

export interface ChartConfig<TType extends ChartType = ChartType> {
  data: ChartData<TType>;
  options: ChartOptions<TType>;
}

const SINGLE_SERIES_FILL_ALPHA_HEX = '33';

export function singleSeriesColor(): string {
  return themePalette().mauve.hex;
}

export function singleSeriesFill(): string {
  return `${singleSeriesColor()}${SINGLE_SERIES_FILL_ALPHA_HEX}`;
}

const CATEGORY_TICK_PADDING_PX = 16;

interface AxisStyling {
  ticks: { color: string; maxRotation?: number; autoSkipPadding?: number; autoSkip?: boolean };
  grid: { display: boolean; color: string };
  border: { display: boolean };
}

/** Gridlines only on the value axis; the category axis stays clean and its labels never rotate. */
export function axisScales(indexAxis: 'x' | 'y' = 'x'): { x: AxisStyling; y: AxisStyling } {
  const tickColor = chartTickColor();
  const gridColor = chartGridColor();
  const valueAxis: AxisStyling = {
    ticks: { color: tickColor },
    grid: { display: true, color: gridColor },
    border: { display: false },
  };
  const categoryAxis: AxisStyling = {
    ticks:
      indexAxis === 'x'
        ? { color: tickColor, maxRotation: 0, autoSkipPadding: CATEGORY_TICK_PADDING_PX }
        : { color: tickColor, autoSkip: false },
    grid: { display: false, color: gridColor },
    border: { display: false },
  };
  return indexAxis === 'x' ? { x: categoryAxis, y: valueAxis } : { x: valueAxis, y: categoryAxis };
}

interface AxisChartConfig {
  indexAxis?: 'x' | 'y';
  showLegend?: boolean;
}

export function axisChartOptions<TType extends ChartType>(config: AxisChartConfig = {}): ChartOptions<TType> {
  const { indexAxis = 'x', showLegend = true } = config;
  const colors = chartColorOptions();

  return {
    ...colors,
    maintainAspectRatio: false,
    indexAxis,
    plugins: {
      ...colors.plugins,
      legend: { display: showLegend },
    },
    scales: axisScales(indexAxis),
  } as unknown as ChartOptions<TType>;
}

const SIDE_LEGEND_MIN_WIDTH_PX = 520;

export function pieChartOptions<TType extends ChartType>(): ChartOptions<TType> {
  const colors = chartColorOptions();

  return {
    ...colors,
    maintainAspectRatio: false,
    interaction: { mode: 'nearest', intersect: true },
    onResize: placeLegendBySize,
    plugins: { ...colors.plugins, legend: { position: 'bottom' } },
  } as unknown as ChartOptions<TType>;
}

/** Side legend when the card is wide enough, bottom legend on narrow cards. */
function placeLegendBySize(chart: Chart, size: { width: number }): void {
  const legend = chart.options.plugins?.legend;
  if (!legend) return;
  const position = size.width >= SIDE_LEGEND_MIN_WIDTH_PX ? 'right' : 'bottom';
  if (legend.position === position) return;
  legend.position = position;
  chart.update('none');
}

export interface GroupOverTimeRow {
  day: string;
  group: string;
  count: string;
}

export interface GroupOverTimeDataset {
  label: string;
  data: number[];
  backgroundColor: string;
  borderColor: string;
  fill: false;
}

export interface GroupOverTimeChart {
  labels: string[];
  datasets: GroupOverTimeDataset[];
}

const TOP_GROUP_SERIES = 10;

/** Renders `{ day, group, count }` rows as a multi-series line chart, keeping only
 * the `TOP_GROUP_SERIES` groups with the highest total count. Missing (day, group)
 * cells are zero-filled so every series spans the full x-axis. */
export function groupOverTimeChart(rows: GroupOverTimeRow[], formatDay: (day: string) => string): GroupOverTimeChart {
  const dayLabel = new Map<string, string>();
  const groupTotals = new Map<string, number>();
  for (const row of rows) {
    dayLabel.set(row.day, formatDay(row.day));
    groupTotals.set(row.group, (groupTotals.get(row.group) ?? 0) + parseInt(row.count, 10));
  }

  const labels = [...dayLabel.values()];
  const topGroups = [...groupTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_GROUP_SERIES)
    .map(([group]) => group);

  const cells = new Map<string, number>();
  for (const row of rows) cells.set(`${row.day}\u0000${row.group}`, parseInt(row.count, 10));

  const datasets = topGroups.map((group, index) => {
    const color = seriesColor(index);
    return {
      label: group,
      data: [...dayLabel.keys()].map((day) => cells.get(`${day}\u0000${group}`) ?? 0),
      backgroundColor: color,
      borderColor: color,
      fill: false as const,
    };
  });

  return { labels, datasets };
}

// Enough for every chart on every tab with a few filter combinations, so the memory use stays small.
const CHART_CACHE_LIMIT = 100;

/**
 * The last response per request, kept across tab switches.
 * A revisited tab draws at once from this cache while the resource loads again in the background.
 */
const chartResponseCache = new Map<string, unknown>();

function chartRequestKey(request: HttpResourceRequest | undefined): string | undefined {
  if (!request) return undefined;

  const params = request.params instanceof HttpParams ? request.params : new HttpParams({ fromObject: request.params });

  return `${request.url}?${params.toString()}`;
}

function rememberChartResponse(key: string, value: unknown): void {
  chartResponseCache.delete(key);
  chartResponseCache.set(key, value);

  if (chartResponseCache.size > CHART_CACHE_LIMIT) {
    const oldestKey = chartResponseCache.keys().next().value;
    if (oldestKey !== undefined) {
      chartResponseCache.delete(oldestKey);
    }
  }
}

export function chartResource<T>(request: () => HttpResourceRequest | undefined) {
  const resource = httpResource<T>(request);
  const key = computed(() => chartRequestKey(request()));

  const cached = computed(() => {
    const currentKey = key();
    return currentKey === undefined ? undefined : (chartResponseCache.get(currentKey) as T | undefined);
  });

  const value = computed(() => resourceValue(resource) ?? cached());

  effect(() => {
    const currentKey = key();
    const loaded = resourceValue(resource);
    if (currentKey !== undefined && loaded !== undefined) {
      rememberChartResponse(currentKey, loaded);
    }
  });

  return {
    resource,
    loading: computed(() => resource.isLoading() && value() === undefined),
    failed: resourceFailed(resource),
    retry: () => resource.reload(),
    hasData: computed(() => value() !== undefined),
    data: computed(() => (value() ?? []) as T),
  };
}

let dayPipe: DatePipe | undefined;

export function formatDay(day: string): string {
  dayPipe ??= new DatePipe(navigator.language);
  return dayPipe.transform(day, 'shortDate') ?? day;
}

/** True when a series has at least one point above zero. Otherwise the chart only draws a flat baseline. */
export function hasPlottedValue<TType extends ChartType>(config: ChartConfig<TType>): boolean {
  return config.data.datasets.some((dataset) =>
    (dataset.data as readonly unknown[]).some((point) => typeof point === 'number' && point > 0),
  );
}

export function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

const ROW_HEIGHT_MOBILE_PX = 22;
const ROW_HEIGHT_DESKTOP_PX = 28;
const ROW_HEIGHT_CHROME_PX = 48;

export function chartRowHeight(rows: number, isMobile: boolean): number {
  return (rows || 1) * (isMobile ? ROW_HEIGHT_MOBILE_PX : ROW_HEIGHT_DESKTOP_PX) + ROW_HEIGHT_CHROME_PX;
}

export function clampAmount(value: number | null | undefined): number {
  return Math.max(1, value ?? 1);
}
