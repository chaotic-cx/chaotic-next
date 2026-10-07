import type { ChartOptions } from 'chart.js';
import { Chart } from 'chart.js';
import { prefersReducedMotion } from '../../functions';
import { themePalette } from '../../theme';

const FONT_FAMILY = "'Inter Variable', Inter, system-ui, sans-serif";
const FONT_SIZE_PX = 12;
const GRID_ALPHA_HEX = '80';
const LINE_WIDTH_PX = 2;
const LINE_TENSION = 0.3;
const POINT_HOVER_RADIUS_PX = 4;
const BAR_RADIUS_PX = 4;
const BAR_MAX_THICKNESS_PX = 28;
const LEGEND_MARKER_PX = 8;
const TOOLTIP_PADDING_PX = 10;
const TOOLTIP_RADIUS_PX = 8;
const ANIMATION_MS = 400;
const DOUGHNUT_CUTOUT = '62%';

export function chartGridColor(): string {
  return `${themePalette().surface0.hex}${GRID_ALPHA_HEX}`;
}

export function chartTickColor(): string {
  return themePalette().subtext0.hex;
}

/**
 * The colours of the chart frame (text, tooltip, arc borders) for the active flavour.
 * Chart options carry them, so a chart re-themes when its options are rebuilt after a flavour change.
 */
export function chartColorOptions(): ChartOptions {
  const palette = themePalette();

  return {
    color: chartTickColor(),
    borderColor: chartGridColor(),
    elements: {
      arc: { borderColor: palette.mantle.hex },
    },
    plugins: {
      tooltip: {
        backgroundColor: palette.mantle.hex,
        borderColor: palette.surface1.hex,
        titleColor: palette.text.hex,
        bodyColor: palette.subtext1.hex,
      },
    },
  };
}

let applied = false;

/**
 * Applies the flavour-independent chart look once, before the first chart renders.
 * Colours come from chartColorOptions().
 */
export function applyChartTheme(): void {
  if (applied) return;
  applied = true;

  const defaults = Chart.defaults;
  defaults.font.family = FONT_FAMILY;
  defaults.font.size = FONT_SIZE_PX;
  /**
   * Merge, never replace: assigning a fresh object would drop the `type`/`fn`
   * keys Chart.js needs to pick an interpolator, and every color animation
   * would then crash with `this._fn is not a function`.
   */
  defaults.set('animation', { duration: prefersReducedMotion() ? 0 : ANIMATION_MS, easing: 'easeOutQuart' });

  defaults.elements.line.borderWidth = LINE_WIDTH_PX;
  defaults.elements.line.tension = LINE_TENSION;
  defaults.elements.line.cubicInterpolationMode = 'monotone';
  defaults.elements.point.radius = 0;
  defaults.elements.point.hoverRadius = POINT_HOVER_RADIUS_PX;
  defaults.elements.point.hitRadius = POINT_HOVER_RADIUS_PX * 2;
  defaults.elements.bar.borderRadius = BAR_RADIUS_PX;
  defaults.elements.arc.borderWidth = LINE_WIDTH_PX;

  defaults.datasets.bar.maxBarThickness = BAR_MAX_THICKNESS_PX;
  Chart.overrides.doughnut.cutout = DOUGHNUT_CUTOUT;
  Chart.overrides.pie.cutout = DOUGHNUT_CUTOUT;

  defaults.interaction.mode = 'index';
  defaults.interaction.intersect = false;

  const legend = defaults.plugins.legend;
  legend.position = 'bottom';
  legend.labels.usePointStyle = true;
  legend.labels.pointStyle = 'circle';
  legend.labels.boxWidth = LEGEND_MARKER_PX;
  legend.labels.boxHeight = LEGEND_MARKER_PX;
  legend.labels.padding = FONT_SIZE_PX * 1.5;

  const tooltip = defaults.plugins.tooltip;
  tooltip.borderWidth = 1;
  tooltip.padding = TOOLTIP_PADDING_PX;
  tooltip.cornerRadius = TOOLTIP_RADIUS_PX;
  tooltip.usePointStyle = true;
  tooltip.boxPadding = LEGEND_MARKER_PX / 2;
  tooltip.titleFont = { weight: 'bold' };
}
