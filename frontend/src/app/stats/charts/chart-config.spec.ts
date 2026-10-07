import { describe, expect, it } from 'vitest';
import { type ChartConfig, hasPlottedValue } from './chart-config';

function lineConfig(...series: number[][]): ChartConfig {
  return {
    data: { labels: [], datasets: series.map((data) => ({ data })) },
    options: {},
  };
}

describe('hasPlottedValue', () => {
  it('is false when every series stays at zero', () => {
    expect(hasPlottedValue(lineConfig([0, 0, 0], [0]))).toBe(false);
  });

  it('is false without any series', () => {
    expect(hasPlottedValue(lineConfig())).toBe(false);
  });

  it('is true when one series has a value above zero', () => {
    expect(hasPlottedValue(lineConfig([0, 0], [0, 3.5]))).toBe(true);
  });
});
