import { describe, expect, it } from 'vitest';
import {
  buildUtilizationGrid,
  utilizationShade,
  type BuilderUtilizationRowDto,
} from './chart-builder-utilization.component';

function bucket(builder: string, hour: number, count: number): BuilderUtilizationRowDto {
  return { builder, hour, count };
}

describe('buildUtilizationGrid', () => {
  it('fills all 24 hours per builder and sorts builders alphabetically', () => {
    const grid = buildUtilizationGrid([bucket('zeta-1', 5, 2), bucket('alpha-1', 9, 1)]);

    expect(grid.rows.map((row) => row.builder)).toEqual(['alpha-1', 'zeta-1']);
    expect(grid.rows[0]?.cells).toHaveLength(24);
    expect(grid.rows[0]?.cells[9]).toEqual({ hour: 9, count: 1 });
    expect(grid.rows[0]?.cells[8]).toEqual({ hour: 8, count: 0 });
    expect(grid.max).toBe(2);
  });

  it('returns an empty grid without data', () => {
    expect(buildUtilizationGrid([])).toEqual({ rows: [], max: 0 });
  });
});

describe('utilizationShade', () => {
  it('keeps idle buckets unshaded', () => {
    expect(utilizationShade(0, 10)).toBe(0);
  });

  it('floors non-zero buckets at a visible minimum and scales to the peak', () => {
    expect(utilizationShade(1, 100)).toBe(16);
    expect(utilizationShade(100, 100)).toBe(100);
  });

  it('never divides by zero when the grid is empty', () => {
    expect(utilizationShade(3, 0)).toBe(0);
  });
});
