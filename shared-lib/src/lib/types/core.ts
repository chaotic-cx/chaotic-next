import { z } from 'zod';

export const CAUR_ALLOWED_CORS = [
  'https://aur.chaotic.cx',
  'https://caur-frontend-pages.dev',
  'https://v2.caur-frontend.pages.dev',
];

export type SortOrder = 'ASC' | 'DESC';

/**
 * Generic envelope of every paginated list endpoint. Zod schemas cannot express
 * open generics, so this stays a hand-written type; the item shape comes from
 * the item schema of the respective endpoint.
 */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export type PkgType = '0' | '1';
export const PKG_TYPE_ARCH = '0' as const satisfies PkgType;
export const PKG_TYPE_CHAOTIC = '1' as const satisfies PkgType;

export type PackageKey = `${PkgType}:${number}`;
export function packageKey(pkgType: PkgType, id: number): PackageKey {
  return `${pkgType}:${id}`;
}

export const buildClassSchema = z.union([z.string(), z.number()]);
export type BuildClass = z.infer<typeof buildClassSchema>;

export const BUILD_CLASS_MIN = 0;
export const BUILD_CLASS_MAX = 10;

export const BUILD_CLASS_TIER_NAMES = ['None', 'Light', 'Medium', 'Heavy', 'Very Heavy'] as const;
const BUILD_CLASS_TIER_UPPER_BOUNDS = [1, 4, 6, 8, BUILD_CLASS_MAX];

export function buildClassTierName(buildClass: number): string {
  const tierIndex = BUILD_CLASS_TIER_UPPER_BOUNDS.findIndex((upperBound) => buildClass <= upperBound);
  return BUILD_CLASS_TIER_NAMES[tierIndex === -1 ? BUILD_CLASS_TIER_NAMES.length - 1 : tierIndex];
}

/** Returns the numeric value of a build class, or null for non-numeric (custom) classes. */
export function parseBuildClass(value: BuildClass): number | null {
  if (typeof value === 'number') return Number.isNaN(value) ? null : value;
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}

/** Sort key for build classes; custom classes sort after all numeric classes. */
export function buildClassSortKey(value: BuildClass): number {
  const parsed = parseBuildClass(value);
  return parsed === null ? BUILD_CLASS_MAX + 1 : parsed;
}

/** Human-readable label, e.g. "9 (Very Heavy)"; custom classes stay as-is. */
export function buildClassLabel(value: BuildClass): string {
  const parsed = parseBuildClass(value);
  return parsed === null ? String(value) : `${parsed} (${buildClassTierName(parsed)})`;
}

export const buildResourceAveragesSchema = z.object({
  avgPeakMemoryBytes: z.number().nullable().optional(),
  avgCpuTimeNs: z.number().nullable().optional(),
  avgDiskIoBytes: z.number().nullable().optional(),
  avgDurationSeconds: z.number().nullable().optional(),
});
export type BuildResourceAverages = z.infer<typeof buildResourceAveragesSchema>;

export const buildClassSuggestionSchema = z.object({
  pkgname: z.string(),
  suggestedBuildClass: z.number().nullable(),
  samples: z.number(),
  averages: buildResourceAveragesSchema.required(),
});
export type BuildClassSuggestion = z.infer<typeof buildClassSuggestionSchema>;

export const MIN_QUERY_LENGTH = 2;

export const MAX_QUERY_LENGTH = 100;
