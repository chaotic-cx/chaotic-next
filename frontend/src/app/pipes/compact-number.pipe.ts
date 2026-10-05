import { Pipe, type PipeTransform } from '@angular/core';
import { MISSING_VALUE } from '../table-columns/missing-value';
import { injectActiveLanguage } from './active-language';

// Marks a rounded figure, for example "~167K" for 167,205.
const APPROXIMATE_PREFIX = '~';

// Some languages, German for example, have no short form for thousands. They fall back to "K" and "M".
const FALLBACK_COMPACT_LANGUAGE = 'en';

/** Formats a large count as its rough size in the given language, with a prefix when the figure is rounded. */
export function formatCompactCount(value: number | null | undefined, language: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return MISSING_VALUE;

  const exact = new Intl.NumberFormat(language).format(value);
  const compact = compactFormat(language, value);
  if (compact !== exact) return `${APPROXIMATE_PREFIX}${compact}`;

  const fallback = compactFormat(FALLBACK_COMPACT_LANGUAGE, value);
  const fallbackExact = new Intl.NumberFormat(FALLBACK_COMPACT_LANGUAGE).format(value);

  return fallback === fallbackExact ? exact : `${APPROXIMATE_PREFIX}${fallback}`;
}

function compactFormat(language: string, value: number): string {
  return new Intl.NumberFormat(language, { notation: 'compact', maximumFractionDigits: 0 }).format(value);
}

/**
 * Shows a large count as its rough size in the active language. The exact count is not the point.
 * Impure, so the output follows a language change.
 */
@Pipe({ name: 'compactNumber', pure: false })
export class CompactNumberPipe implements PipeTransform {
  private readonly language = injectActiveLanguage();

  transform(value: number | null | undefined): string {
    return formatCompactCount(value, this.language());
  }
}
