import { flavors } from '@catppuccin/palette';
import type { ChartData, ChartOptions, ChartType } from 'chart.js';
import { CATPPUCCIN_FLAVOURS } from '../../theme';

export interface ChartConfig<TType extends ChartType = ChartType> {
  data: ChartData<TType>;
  options: ChartOptions<TType>;
}

const MOCHA_TEXT = flavors.mocha.colors.text.hex;
const MOCHA_SURFACE_0 = flavors.mocha.colors.surface0.hex;
const CHART_FONT_FAMILY = "'Inter Variable', 'Helvetica', 'Arial', sans-serif";

interface AxisStyling {
  ticks: { color: string };
  grid: { color: string };
}

export function mochaLegendLabels(): { usePointStyle: false; color: string; family: string } {
  return { usePointStyle: false, color: MOCHA_TEXT, family: CHART_FONT_FAMILY };
}

export function mochaScales(): { x: AxisStyling; y: AxisStyling } {
  const axis: AxisStyling = {
    ticks: { color: MOCHA_TEXT },
    grid: { color: MOCHA_SURFACE_0 },
  };
  return { x: axis, y: axis };
}

interface MochaAxisChartOptions {
  indexAxis?: 'x' | 'y';
}

export function mochaAxisChartOptions<TType extends ChartType>(
  config: MochaAxisChartOptions = {},
): ChartOptions<TType> {
  const { indexAxis = 'x' } = config;

  const options = {
    maintainAspectRatio: false,
    aspectRatio: 0.4,
    plugins: {
      legend: { labels: mochaLegendLabels() },
    },
    scales: mochaScales(),
  } as const;
  return (indexAxis === 'y' ? { ...options, indexAxis: 'y' } : options) as unknown as ChartOptions<TType>;
}

export function mochaPieChartOptions<TType extends ChartType>(): ChartOptions<TType> {
  return {
    plugins: {
      legend: { labels: mochaLegendLabels(), position: 'top' },
    },
  } as unknown as ChartOptions<TType>;
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
    const color = CATPPUCCIN_FLAVOURS[index % CATPPUCCIN_FLAVOURS.length];
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
