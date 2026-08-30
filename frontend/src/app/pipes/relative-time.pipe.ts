import { Pipe, PipeTransform } from '@angular/core';

interface RelativeTimeDivision {
  amount: number;
  unit: Intl.RelativeTimeFormatUnit;
}

const DIVISIONS: RelativeTimeDivision[] = [
  { amount: 60, unit: 'second' },
  { amount: 60, unit: 'minute' },
  { amount: 24, unit: 'hour' },
  { amount: 7, unit: 'day' },
  { amount: 4.34524, unit: 'week' },
  { amount: 12, unit: 'month' },
  { amount: Number.POSITIVE_INFINITY, unit: 'year' },
];

const FORMATTER = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

export function formatRelativeTime(value: string | Date | number | null | undefined): string {
  if (value == null) return '';
  const date = value instanceof Date ? value : new Date(value);
  let duration = (date.getTime() - Date.now()) / 1000;
  if (Number.isNaN(duration)) return '';
  if (duration < 0 && duration > -60) return 'just now';
  let division = DIVISIONS[0];
  for (const current of DIVISIONS) {
    division = current;
    if (Math.abs(duration) < current.amount) break;
    duration /= current.amount;
  }
  return FORMATTER.format(Math.round(duration), division.unit);
}

@Pipe({ name: 'relativeTime' })
export class RelativeTimePipe implements PipeTransform {
  transform(value: string | Date | number | null | undefined): string {
    return formatRelativeTime(value);
  }
}
