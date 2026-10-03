import { flavors } from '@catppuccin/palette';
import { Chart } from 'chart.js/auto';

const mocha = flavors.mocha.colors;

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

export const CHART_GRID_COLOR = `${mocha.surface0.hex}${GRID_ALPHA_HEX}`;
export const CHART_TICK_COLOR = mocha.subtext0.hex;

let applied = false;

/** Applies the Mocha chart look once, before the first chart renders. */
export function applyChartTheme(): void {
  if (applied) return;
  applied = true;

  const defaults = Chart.defaults;
  defaults.font.family = FONT_FAMILY;
  defaults.font.size = FONT_SIZE_PX;
  defaults.color = CHART_TICK_COLOR;
  defaults.borderColor = CHART_GRID_COLOR;
  defaults.animation = { duration: ANIMATION_MS, easing: 'easeOutQuart' };

  defaults.elements.line.borderWidth = LINE_WIDTH_PX;
  defaults.elements.line.tension = LINE_TENSION;
  defaults.elements.line.cubicInterpolationMode = 'monotone';
  defaults.elements.point.radius = 0;
  defaults.elements.point.hoverRadius = POINT_HOVER_RADIUS_PX;
  defaults.elements.point.hitRadius = POINT_HOVER_RADIUS_PX * 2;
  defaults.elements.bar.borderRadius = BAR_RADIUS_PX;
  defaults.elements.arc.borderWidth = LINE_WIDTH_PX;
  defaults.elements.arc.borderColor = mocha.mantle.hex;

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
  tooltip.backgroundColor = mocha.mantle.hex;
  tooltip.borderColor = mocha.surface1.hex;
  tooltip.borderWidth = 1;
  tooltip.titleColor = mocha.text.hex;
  tooltip.bodyColor = mocha.subtext1.hex;
  tooltip.padding = TOOLTIP_PADDING_PX;
  tooltip.cornerRadius = TOOLTIP_RADIUS_PX;
  tooltip.usePointStyle = true;
  tooltip.boxPadding = LEGEND_MARKER_PX / 2;
  tooltip.titleFont = { weight: 'bold' };
}
