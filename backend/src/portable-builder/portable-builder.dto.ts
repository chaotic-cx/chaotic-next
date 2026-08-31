import { z } from 'zod';
import { buildResourceMetricsSchema } from '@chaotic-next/shared-lib';
import { PORTABLE_BUILD_STATUSES } from './portable-build.entity';

export const portableBuildSchema = z.object({
  id: z.number().describe('Record ID'),
  pkgbase: z.string().describe('AUR pkgbase that was built'),
  status: z.enum(PORTABLE_BUILD_STATUSES).describe('Build state'),
  issueNumber: z.number().nullable().describe('GitHub issue the build was queued from'),
  error: z.string().nullable().describe('Failure reason'),
  artifacts: z.array(z.string()).nullable().describe('Built package file names kept on disk'),
  resourceStats: buildResourceMetricsSchema.nullable().describe('Sampled container resource usage'),
  startedAt: z.string().nullable().describe('When the build started (ISO 8601)'),
  finishedAt: z.string().nullable().describe('When the build finished (ISO 8601)'),
  createdAt: z.string().describe('When the build was queued (ISO 8601)'),
});
export type PortableBuildDto = z.infer<typeof portableBuildSchema>;

export const enqueueBuildBodySchema = z.object({
  pkgbase: z.string().min(1).describe('AUR pkgbase to build'),
  issueNumber: z.number().int().positive().optional().describe('GitHub issue to report the result to'),
});
export type EnqueueBuildBodyDto = z.infer<typeof enqueueBuildBodySchema>;

export const listBuildsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1).describe('Page number'),
  perPage: z.coerce.number().int().positive().max(100).default(50).describe('Entries per page'),
  pkgbase: z.string().optional().describe('Filter by pkgbase'),
  status: z.enum(PORTABLE_BUILD_STATUSES).optional().describe('Filter by status'),
});
export type ListBuildsQueryDto = z.infer<typeof listBuildsQuerySchema>;
