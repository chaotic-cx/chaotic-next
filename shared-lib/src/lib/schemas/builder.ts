import { z } from 'zod';
import {
  amountParamSchema,
  daysParamSchema,
  INT4_MAX,
  offsetQuerySchema,
  pageQuerySchema,
  perPageQuerySchema,
  statusQuerySchema,
} from './common';

export const getPackagesQuerySchema = z.strictObject({
  repo: z.union([z.boolean(), z.stringbool()]).default(false).describe('Include repository information'),
  repoId: z.coerce.number().int().min(0).max(INT4_MAX).optional().describe('Filter by repository id'),
  page: pageQuerySchema.optional(),
  perPage: perPageQuerySchema.optional(),
  q: z.string().optional().describe('Search term matched against package names'),
  sort: z.string().optional().describe('Field to sort by'),
  order: z.string().optional().describe('Sort direction (asc/desc)'),
});

export type GetPackagesQueryDto = z.infer<typeof getPackagesQuerySchema>;

export const getBuildsQuerySchema = z.strictObject({
  builder: z
    .preprocess(
      (value) => (value == null || value === '' ? undefined : Array.isArray(value) ? value : [value]),
      z.array(z.string()).optional(),
    )
    .describe('Filter by builder name; repeat the parameter for several'),
  repo: z.string().optional().describe('Filter by repository name'),
  status: z
    .preprocess(
      (value) => (value == null || value === '' ? undefined : Array.isArray(value) ? value : [value]),
      z.array(statusQuerySchema).optional(),
    )
    .describe('Filter by numeric build status; repeat the parameter for several'),
  page: pageQuerySchema.optional(),
  perPage: perPageQuerySchema.optional(),
  q: z.string().optional().describe('Search term matched against package names'),
  sort: z.string().optional().describe('Field to sort by'),
  order: z.string().optional().describe('Sort direction (asc/desc)'),
});

export type GetBuildsQueryDto = z.infer<typeof getBuildsQuerySchema>;

export const getLatestBuildsQuerySchema = z.strictObject({
  amount: amountParamSchema.default(50).describe('How many builds to return'),
  offset: offsetQuerySchema.default(0).describe('Number of builds to skip'),
  status: statusQuerySchema.optional().describe('Filter by numeric build status'),
});

export type GetLatestBuildsQueryDto = z.infer<typeof getLatestBuildsQuerySchema>;

export const latestForPackageQuerySchema = z.strictObject({
  offset: offsetQuerySchema.default(0).describe('Number of builds to skip'),
  amount: amountParamSchema.default(30).describe('How many builds to return'),
});
export type LatestForPackageQueryDto = z.infer<typeof latestForPackageQuerySchema>;

export const popularBuildsQuerySchema = z.strictObject({
  offset: offsetQuerySchema.default(0).describe('Number of entries to skip'),
  status: statusQuerySchema.optional().describe('Only count builds with this numeric status'),
  days: daysParamSchema.optional().describe('Lookback window in days; all time when omitted'),
});
export type PopularBuildsQueryDto = z.infer<typeof popularBuildsQuerySchema>;

export const pkgnameListQuerySchema = z.strictObject({
  pkgname: z
    .preprocess(
      (value) => (value === undefined ? undefined : Array.isArray(value) ? value : [value]),
      z.array(z.string()).min(1),
    )
    .describe('Package names to look up; repeat the parameter for several'),
  builder: z
    .preprocess(
      (value) => (value == null || value === '' ? undefined : Array.isArray(value) ? value : [value]),
      z.array(z.string()).optional(),
    )
    .describe('Filter to specific builder nodes; repeat the parameter for several'),
  days: daysParamSchema.optional().describe('Lookback window in days; all time when omitted'),
});
export type PkgnameListQueryDto = z.infer<typeof pkgnameListQuerySchema>;
