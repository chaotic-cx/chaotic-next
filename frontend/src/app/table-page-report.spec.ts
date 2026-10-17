import { describe, expect, it } from 'vitest';
import { formatPageReport } from './table-page-report.directive';

const TEMPLATE = '{first}–{last} of {totalRecords}';
const germanFormat = new Intl.NumberFormat('de');

function german(value: number): string {
  return germanFormat.format(value);
}

describe('formatPageReport', () => {
  it('formats the numbers with the given locale', () => {
    expect(formatPageReport(TEMPLATE, { first: 1000, rows: 25, total: 1240 }, german)).toBe('1.001–1.025 of 1.240');
  });

  it('caps the last entry at the total', () => {
    expect(formatPageReport(TEMPLATE, { first: 1225, rows: 25, total: 1240 }, german)).toBe('1.226–1.240 of 1.240');
  });

  it('reports zero for an empty table', () => {
    expect(formatPageReport(TEMPLATE, { first: 0, rows: 25, total: 0 }, german)).toBe('0–0 of 0');
  });
});
