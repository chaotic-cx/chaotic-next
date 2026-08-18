import { flavors } from '@catppuccin/palette';
import type { ChartData, ChartOptions, ChartType } from 'chart.js';

export interface ChartConfig<TType extends ChartType = ChartType> {
  data: ChartData<TType>;
  options: ChartOptions<TType>;
}

const MOCHA_TEXT = flavors.mocha.colors.text.hex;
const MOCHA_SURFACE_0 = flavors.mocha.colors.surface0.hex;
const CHART_FONT_FAMILY = "'Inter', 'Helvetica', 'Arial', sans-serif";

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
