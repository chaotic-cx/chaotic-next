import { MAX_PAGE, MAX_PER_PAGE, paginate, resolveOrder, resolvePagination } from './pagination';
import { describe, expect, it } from 'vitest';

describe('resolvePagination', () => {
  it('defaults to page 1 and 25 rows per page', () => {
    expect(resolvePagination()).toEqual({ page: 1, perPage: 25, skip: 0 });
  });

  it('uses the provided page and perPage', () => {
    expect(resolvePagination(3, 50)).toEqual({ page: 3, perPage: 50, skip: 100 });
  });

  it('clamps page below 1 to 1', () => {
    expect(resolvePagination(0, 25).page).toBe(1);
  });

  it('clamps a negative page to 1', () => {
    expect(resolvePagination(-5, 25).page).toBe(1);
  });

  it('clamps perPage below 1 to 1', () => {
    expect(resolvePagination(1, 0).perPage).toBe(1);
  });

  it('clamps a negative perPage to 1', () => {
    expect(resolvePagination(1, -10).perPage).toBe(1);
  });

  it('clamps perPage above the upper bound to the upper bound', () => {
    expect(resolvePagination(1, MAX_PER_PAGE + 100).perPage).toBe(MAX_PER_PAGE);
  });

  it('accepts perPage at the upper bound', () => {
    expect(resolvePagination(1, MAX_PER_PAGE).perPage).toBe(MAX_PER_PAGE);
  });

  it('clamps perPage just above the upper bound to the upper bound', () => {
    expect(resolvePagination(1, MAX_PER_PAGE + 1).perPage).toBe(MAX_PER_PAGE);
  });

  it('caps page at the upper bound', () => {
    expect(resolvePagination(MAX_PAGE + 100, 25).page).toBe(MAX_PAGE);
  });

  it('accepts page at the upper bound', () => {
    expect(resolvePagination(MAX_PAGE, 25).page).toBe(MAX_PAGE);
  });

  it('clamps page just above the upper bound to the upper bound', () => {
    expect(resolvePagination(MAX_PAGE + 1, 25).page).toBe(MAX_PAGE);
  });

  it('computes skip correctly', () => {
    expect(resolvePagination(4, 25).skip).toBe(75);
  });
});

describe('resolveOrder', () => {
  it('defaults to DESC', () => {
    expect(resolveOrder()).toBe('DESC');
  });

  it('returns DESC for undefined', () => {
    expect(resolveOrder(undefined)).toBe('DESC');
  });

  it('returns ASC for uppercase ASC', () => {
    expect(resolveOrder('ASC')).toBe('ASC');
  });

  it('returns ASC for lowercase asc', () => {
    expect(resolveOrder('asc')).toBe('ASC');
  });

  it('returns DESC for explicit DESC', () => {
    expect(resolveOrder('DESC')).toBe('DESC');
  });

  it('returns DESC for an unrecognized value', () => {
    expect(resolveOrder('random')).toBe('DESC');
  });

  it('returns DESC for an empty string', () => {
    expect(resolveOrder('')).toBe('DESC');
  });

  it('does not trim surrounding whitespace (leading space falls back to DESC)', () => {
    expect(resolveOrder(' asc')).toBe('DESC');
  });
});

describe('paginate', () => {
  it('builds the paginated envelope', () => {
    const items = [{ id: 1 }];
    expect(paginate(items, 100, 2, 25)).toEqual({
      items,
      total: 100,
      page: 2,
      perPage: 25,
      totalPages: 4,
    });
  });

  it('rounds totalPages up for a partial last page', () => {
    expect(paginate([], 101, 1, 25).totalPages).toBe(5);
  });

  it('handles zero total with zero pages', () => {
    const result = paginate([], 0, 1, 25);
    expect(result.totalPages).toBe(0);
  });

  it('produces NaN totalPages when both total and perPage are 0', () => {
    expect(paginate([], 0, 1, 0).totalPages).toBeNaN();
  });

  it('produces Infinity totalPages when perPage is 0 but total is not', () => {
    expect(paginate([], 100, 1, 0).totalPages).toBe(Number.POSITIVE_INFINITY);
  });
});
