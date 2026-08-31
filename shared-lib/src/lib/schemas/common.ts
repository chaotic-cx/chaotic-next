import { z } from 'zod';

/** Mirrors the backend clamp so the schema documents and enforces the real bounds. */
const MAX_AMOUNT = 100;
/** Mirrors the backend clamp so the schema documents and enforces the real bounds. */
const MAX_DAYS_WINDOW = 3650;
/** Largest page size that list endpoints accept. */
export const MAX_PER_PAGE = 100;

/** Postgres int4 ceiling; keeps generated schemas free of float-precision noise. */
export const INT4_MAX = 2_147_483_647;

export const idParamSchema = z.coerce.number().int().positive().max(INT4_MAX).describe('Numeric database id');

/** GitLab-side ids are independent sequences and already exceed the int4 range. */
export const gitlabIdParamSchema = z.coerce
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER)
  .describe('Numeric GitLab id');

export const amountParamSchema = z.coerce
  .number()
  .int()
  .positive()
  .max(MAX_AMOUNT)
  .describe('How many entries to return');

export const daysParamSchema = z.coerce
  .number()
  .int()
  .positive()
  .max(MAX_DAYS_WINDOW)
  .describe('Lookback window in days');

export const offsetQuerySchema = z.coerce
  .number()
  .int()
  .nonnegative()
  .max(INT4_MAX)
  .describe('Number of entries to skip');

export const statusQuerySchema = z.coerce.number().int().min(0).max(INT4_MAX).describe('Numeric build status');

export const pageQuerySchema = z.coerce.number().int().min(1).max(INT4_MAX).describe('1-based page number');

export const perPageQuerySchema = z.coerce.number().int().min(1).max(MAX_PER_PAGE).describe('Entries per page');

export const daysQuerySchema = z.strictObject({
  days: daysParamSchema.optional().describe('Lookback window in days; all time when omitted'),
});

export type DaysQueryDto = z.infer<typeof daysQuerySchema>;

export const daysRepoQuerySchema = z.strictObject({
  days: daysParamSchema.optional().describe('Lookback window in days; all time when omitted'),
  repo: z.string().optional().describe('Repository name to filter by'),
});

export type DaysRepoQueryDto = z.infer<typeof daysRepoQuerySchema>;

export const repoQuerySchema = z.strictObject({
  repo: z.string().optional().describe('Repository name to filter by'),
});

export type RepoQueryDto = z.infer<typeof repoQuerySchema>;
