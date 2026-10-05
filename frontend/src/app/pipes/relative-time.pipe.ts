import { computed, Pipe, PipeTransform, type Signal } from '@angular/core';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { injectGlobalTranslation } from '../i18n/global-translation';
import { injectActiveLanguage } from './active-language';

interface RelativeTimeDivision {
  amount: number;
  unit: Intl.RelativeTimeFormatUnit;
}

export interface RelativeTimeLabels {
  locale: string;
  justNow: string;
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

const MS_PER_SECOND = 1000;
const JUST_NOW_SECONDS = 60;

const formatters = new Map<string, Intl.RelativeTimeFormat>();

function formatterFor(locale: string): Intl.RelativeTimeFormat {
  const cached = formatters.get(locale);
  if (cached) return cached;

  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  formatters.set(locale, formatter);
  return formatter;
}

export function formatRelativeTime(
  value: string | Date | number | null | undefined,
  labels: RelativeTimeLabels,
): string {
  if (value == null) return '';

  const date = value instanceof Date ? value : new Date(value);
  let duration = (date.getTime() - Date.now()) / MS_PER_SECOND;
  if (Number.isNaN(duration)) return '';

  if (duration < 0 && duration > -JUST_NOW_SECONDS) return labels.justNow;

  let division = DIVISIONS[0];
  for (const current of DIVISIONS) {
    division = current;
    if (Math.abs(duration) < current.amount) break;

    duration /= current.amount;
  }

  return formatterFor(labels.locale).format(Math.round(duration), division.unit);
}

/**
 * Labels for `formatRelativeTime` in the active language.
 * Read it inside a `computed`, so the text follows a language change.
 */
export function injectRelativeTimeLabels(): Signal<RelativeTimeLabels> {
  const activeLanguage = injectActiveLanguage();
  const justNow = injectGlobalTranslation(marker('pipes.relativeTime.justNow'));

  return computed(() => ({ locale: activeLanguage(), justNow: justNow() }));
}

/**
 * Impure, so the text follows a language change.
 * Reading the active language signal marks the view for a refresh.
 */
@Pipe({ name: 'relativeTime', pure: false })
export class RelativeTimePipe implements PipeTransform {
  private readonly labels = injectRelativeTimeLabels();

  transform(value: string | Date | number | null | undefined): string {
    return formatRelativeTime(value, this.labels());
  }
}
