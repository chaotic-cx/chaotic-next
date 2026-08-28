import { PKG_TYPE_ARCH, PKG_TYPE_CHAOTIC } from '../types';
import { INT4_MAX, pageQuerySchema, perPageQuerySchema } from './common';
import { z } from 'zod';

export const createBuilderBodySchema = z.strictObject({
  name: z.string().describe('Builder name'),
  description: z.string().optional().describe('Builder description'),
  builderClass: z.string().optional().describe('Assigned build class'),
  isActive: z.boolean().optional().describe('Whether the builder is active'),
});

export type CreateBuilderBodyDto = z.infer<typeof createBuilderBodySchema>;

export const createElfAnalysisBodySchema = z.strictObject({
  pkgType: z.enum([PKG_TYPE_ARCH, PKG_TYPE_CHAOTIC]).describe('Package type (0 for Arch, 1 for Chaotic)'),
  pkgId: z.number().int().describe('ID of the analysed package'),
  version: z.string().describe('Version of the analysed package'),
  broken: z.boolean().optional().describe('Whether the package is flagged broken'),
  brokenReasons: z.array(z.string()).optional().describe('Reasons the package is flagged broken'),
});

export type CreateElfAnalysisBodyDto = z.infer<typeof createElfAnalysisBodySchema>;

export const updatePackageBodySchema = z.strictObject({
  pkgname: z.string().min(1).describe('Package name'),
  isActive: z.boolean().describe('Whether the package is active'),
  skipSignalScan: z.boolean().describe('Exclude the package from ELF signal scanning'),
  version: z.string().describe('Package version'),
  pkgrel: z.number().int().describe('Package release number'),
  bump: z.number().int().describe('Bump counter'),
  repoId: z.number().int().describe('Repository id'),
});

export type UpdatePackageBodyDto = z.infer<typeof updatePackageBodySchema>;

export const updateArchPackageBodySchema = z.strictObject({
  pkgname: z.string().min(1).describe('Package name'),
  version: z.string().describe('Package version'),
  pkgrel: z.number().int().describe('Package release number'),
  arch: z.string().describe('Target architecture'),
});

export type UpdateArchPackageBodyDto = z.infer<typeof updateArchPackageBodySchema>;

export const createRepoBodySchema = z.strictObject({
  name: z.string().min(1).describe('Repository name'),
  repoUrl: z.string().optional().describe('Repository URL'),
  isActive: z.boolean().optional().describe('Whether the repository is active'),
  gitRef: z.string().optional().describe('Git ref used for the repo checkout'),
  dbPath: z.string().optional().describe('Path of the repository database file'),
  status: z.number().int().optional().describe('Repository status'),
  gitlabProjectId: z.string().optional().describe('GitLab project ID'),
  apiToken: z.string().optional().describe('Encrypted GitLab API token'),
});

export type CreateRepoBodyDto = z.infer<typeof createRepoBodySchema>;

export const listAdminPackagesQuerySchema = z.strictObject({
  page: pageQuerySchema.optional(),
  perPage: perPageQuerySchema.optional(),
  q: z.string().optional().describe('Search term matched against package names'),
  repoId: z.coerce.number().int().min(0).max(INT4_MAX).optional().describe('Filter by repository id'),
  active: z.string().optional().describe('Filter by active state ("true"/"false")'),
});

export type ListAdminPackagesQueryDto = z.infer<typeof listAdminPackagesQuerySchema>;

export const listArchPackagesQuerySchema = z.strictObject({
  page: pageQuerySchema.optional(),
  perPage: perPageQuerySchema.optional(),
  q: z.string().optional().describe('Search term matched against package names'),
});

export type ListArchPackagesQueryDto = z.infer<typeof listArchPackagesQuerySchema>;

export const listBuildersQuerySchema = z.strictObject({
  page: pageQuerySchema.optional(),
  perPage: perPageQuerySchema.optional(),
  q: z.string().optional().describe('Search term matched against builder names'),
  active: z.string().optional().describe('Filter by active state ("true"/"false")'),
});

export type ListBuildersQueryDto = z.infer<typeof listBuildersQuerySchema>;

export const listMrActionsQuerySchema = z.strictObject({
  page: pageQuerySchema.optional(),
  perPage: perPageQuerySchema.optional(),
  q: z.string().optional().describe('Search term matched against user names'),
  action: z.string().optional().describe('Filter by action name'),
});

export type ListMrActionsQueryDto = z.infer<typeof listMrActionsQuerySchema>;

export const listPipelineTriggersQuerySchema = z.strictObject({
  page: pageQuerySchema.optional(),
  perPage: perPageQuerySchema.optional(),
  q: z.string().optional().describe('Search term matched against user names'),
  operation: z.string().optional().describe('Filter by pipeline operation'),
});

export type ListPipelineTriggersQueryDto = z.infer<typeof listPipelineTriggersQuerySchema>;

export const listPackageBumpsQuerySchema = z.strictObject({
  page: pageQuerySchema.optional(),
  perPage: perPageQuerySchema.optional(),
  q: z.string().optional().describe('Search term matched against package names'),
  bumpType: z.coerce.number().int().min(0).max(INT4_MAX).optional().describe('Filter by bump type id'),
  triggerFrom: z.coerce
    .number()
    .int()
    .min(0)
    .max(INT4_MAX)
    .optional()
    .describe('Filter by trigger origin (0 Arch, 1 Chaotic)'),
});

export type ListPackageBumpsQueryDto = z.infer<typeof listPackageBumpsQuerySchema>;

export const listElfAnalysisQuerySchema = z.strictObject({
  page: pageQuerySchema.optional(),
  perPage: perPageQuerySchema.optional(),
  q: z.string().optional().describe('Search term matched against package names'),
  pkgType: z.string().optional().describe('Filter by package type (0 for Arch, 1 for Chaotic)'),
  broken: z.string().optional().describe('Filter by broken state ("true"/"false")'),
});

export type ListElfAnalysisQueryDto = z.infer<typeof listElfAnalysisQuerySchema>;

export const rescanPackageItemSchema = z.strictObject({
  pkgname: z.string().describe('Package name'),
  pkgType: z.string().describe('Package type (0 for Arch, 1 for Chaotic)'),
  repo: z.string().optional().describe('Repository name'),
});

export type RescanPackageItemDto = z.infer<typeof rescanPackageItemSchema>;

export const rescanPackagesBodySchema = z.strictObject({
  packages: z.array(rescanPackageItemSchema).min(1).describe('Packages to rescan'),
});

export type RescanPackagesDto = z.infer<typeof rescanPackagesBodySchema>;
