import { describe, expect, it } from 'vitest';
// Auto-registers every controller/scale/plugin, like the chart module does in the app.
import { Chart } from 'chart.js/auto';
import { applyChartTheme } from './chart-theme';

function stubMatchMedia(): void {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

describe('applyChartTheme', () => {
  it('merges animation defaults so Chart.js keeps the keys it interpolates with', () => {
    stubMatchMedia();
    applyChartTheme();

    const animation = Chart.defaults.get('animation') as Record<string, unknown>;
    expect(animation['duration']).toEqual(expect.any(Number));
    expect(animation['easing']).toBe('easeOutQuart');
    expect('type' in animation).toBe(true);
    expect('fn' in animation).toBe(true);
  });
});
