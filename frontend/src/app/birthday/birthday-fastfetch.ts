import { marker } from '@jsverse/transloco-keys-manager/marker';
import { BIRTHDAY_AGE } from './birthday.config';

export interface FastfetchRow {
  labelKey: string;
  valueKey: string;
  params: Record<string, number>;
}

export interface FormattedFastfetchRow {
  labelKey: string;
  valueKey: string;
  params: Record<string, string>;
}

export const UPTIME_ROW: FastfetchRow = {
  labelKey: marker('memorial.edition2026.fastfetch.uptime.label'),
  valueKey: marker('memorial.edition2026.fastfetch.uptime.value'),
  params: { years: BIRTHDAY_AGE },
};

export const MIRRORS_ROW: FastfetchRow = {
  labelKey: marker('memorial.edition2026.fastfetch.mirrors.label'),
  valueKey: marker('memorial.edition2026.fastfetch.mirrors.value'),
  params: { mirrors: 55, countries: 26 },
};

/**
 * Counted from 30,169 commits in 18 repositories on 2026-10-17.
 * Human counts leave out the CI bots and the Temeraire server commits.
 * Hour and weekday counts use only commits with a real time zone offset.
 */
export const FASTFETCH_ROWS: FastfetchRow[] = [
  UPTIME_ROW,
  {
    labelKey: marker('memorial.edition2026.fastfetch.commits.label'),
    valueKey: marker('memorial.edition2026.fastfetch.commits.value'),
    params: { total: 30_169 },
  },
  {
    labelKey: marker('memorial.edition2026.fastfetch.humans.label'),
    valueKey: marker('memorial.edition2026.fastfetch.humans.value'),
    params: { humans: 12_582, bots: 17_587 },
  },
  {
    labelKey: marker('memorial.edition2026.fastfetch.recordYear.label'),
    valueKey: marker('memorial.edition2026.fastfetch.recordYear.value'),
    params: { count: 4_422 },
  },
  {
    labelKey: marker('memorial.edition2026.fastfetch.busiestDay.label'),
    valueKey: marker('memorial.edition2026.fastfetch.busiestDay.value'),
    params: { count: 456 },
  },
  MIRRORS_ROW,
  {
    labelKey: marker('memorial.edition2026.fastfetch.nightShift.label'),
    valueKey: marker('memorial.edition2026.fastfetch.nightShift.value'),
    params: { count: 417 },
  },
  {
    labelKey: marker('memorial.edition2026.fastfetch.favoriteDay.label'),
    valueKey: marker('memorial.edition2026.fastfetch.favoriteDay.value'),
    params: { count: 932 },
  },
  {
    labelKey: marker('memorial.edition2026.fastfetch.christmas.label'),
    valueKey: marker('memorial.edition2026.fastfetch.christmas.value'),
    params: { count: 21 },
  },
  {
    labelKey: marker('memorial.edition2026.fastfetch.biggestCommit.label'),
    valueKey: marker('memorial.edition2026.fastfetch.biggestCommit.value'),
    params: { lines: 61_226 },
  },
  {
    labelKey: marker('memorial.edition2026.fastfetch.streak.label'),
    valueKey: marker('memorial.edition2026.fastfetch.streak.value'),
    params: { days: 35 },
  },
  {
    labelKey: marker('memorial.edition2026.fastfetch.topWord.label'),
    valueKey: marker('memorial.edition2026.fastfetch.topWord.value'),
    params: { count: 1_388 },
  },
  {
    labelKey: marker('memorial.edition2026.fastfetch.cleanups.label'),
    valueKey: marker('memorial.edition2026.fastfetch.cleanups.value'),
    params: { count: 109 },
  },
  {
    labelKey: marker('memorial.edition2026.fastfetch.kernelParties.label'),
    valueKey: marker('memorial.edition2026.fastfetch.kernelParties.value'),
    params: { count: 8 },
  },
  {
    labelKey: marker('memorial.edition2026.fastfetch.oops.label'),
    valueKey: marker('memorial.edition2026.fastfetch.oops.value'),
    params: { count: 22 },
  },
  {
    labelKey: marker('memorial.edition2026.fastfetch.rip.label'),
    valueKey: marker('memorial.edition2026.fastfetch.rip.value'),
    params: { count: 22 },
  },
  {
    labelKey: marker('memorial.edition2026.fastfetch.reverts.label'),
    valueKey: marker('memorial.edition2026.fastfetch.reverts.value'),
    params: { count: 75 },
  },
  {
    labelKey: marker('memorial.edition2026.fastfetch.typos.label'),
    valueKey: marker('memorial.edition2026.fastfetch.typos.value'),
    params: { count: 39 },
  },
  {
    labelKey: marker('memorial.edition2026.fastfetch.fixStreak.label'),
    valueKey: marker('memorial.edition2026.fastfetch.fixStreak.value'),
    params: { count: 5 },
  },
  {
    labelKey: marker('memorial.edition2026.fastfetch.shortest.label'),
    valueKey: marker('memorial.edition2026.fastfetch.shortest.value'),
    params: {},
  },
  {
    labelKey: marker('memorial.edition2026.fastfetch.emoji.label'),
    valueKey: marker('memorial.edition2026.fastfetch.emoji.value'),
    params: { count: 4 },
  },
  {
    labelKey: marker('memorial.edition2026.fastfetch.ciBot.label'),
    valueKey: marker('memorial.edition2026.fastfetch.ciBot.value'),
    params: { count: 10_003 },
  },
  {
    labelKey: marker('memorial.edition2026.fastfetch.pkgrelBumps.label'),
    valueKey: marker('memorial.edition2026.fastfetch.pkgrelBumps.value'),
    params: { count: 795 },
  },
  {
    labelKey: marker('memorial.edition2026.fastfetch.hyprlandPortal.label'),
    valueKey: marker('memorial.edition2026.fastfetch.hyprlandPortal.value'),
    params: { count: 12 },
  },
];

/**
 * Formats the numbers in the row for the given language, so the translation gets "30.169" in German.
 */
export function formatFastfetchRow(row: FastfetchRow, numberFormat: Intl.NumberFormat): FormattedFastfetchRow {
  const params: Record<string, string> = {};
  for (const [name, value] of Object.entries(row.params)) {
    params[name] = numberFormat.format(value);
  }

  return { labelKey: row.labelKey, valueKey: row.valueKey, params };
}

export function formatFastfetchRows(rows: FastfetchRow[], language: string): FormattedFastfetchRow[] {
  const numberFormat = new Intl.NumberFormat(language);
  const formatted: FormattedFastfetchRow[] = [];
  for (const row of rows) {
    formatted.push(formatFastfetchRow(row, numberFormat));
  }

  return formatted;
}
