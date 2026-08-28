import { PKG_TYPE_ARCH, PKG_TYPE_CHAOTIC } from '../types';
import { pageQuerySchema, perPageQuerySchema } from './common';
import { z } from 'zod';

export const bumpPackagesBodySchema = z.strictObject({
  pkgnames: z.array(z.string()).min(1).describe('Package names to bump'),
});

export type BumpPackagesBodyDto = z.infer<typeof bumpPackagesBodySchema>;

export const brokenPackagesQuerySchema = z.strictObject({
  page: pageQuerySchema.optional(),
  perPage: perPageQuerySchema.optional(),
});

export type BrokenPackagesQueryDto = z.infer<typeof brokenPackagesQuerySchema>;

export const seedEntrySchema = z
  .object({
    pkgType: z.enum([PKG_TYPE_ARCH, PKG_TYPE_CHAOTIC]).describe('Package type (0 for Arch, 1 for Chaotic)'),
    version: z.string().min(1).describe('Package version'),
    pkgId: z.number().int().optional().describe('Package ID'),
    pkgname: z.string().min(1).optional().describe('Package name'),
    repo: z.string().optional().describe('Repository name'),
    files: z.array(z.string()).default([]),
    neededSonames: z.array(z.string()).default([]),
    providedSonames: z.array(z.string()).default([]),
    importedSymbols: z.array(z.string()).default([]),
    exportedSymbols: z.record(z.string(), z.array(z.string())).default({}),
    vtables: z.record(z.string(), z.array(z.string())).default({}),
    directoriesOwned: z.array(z.string()).default([]),
    directDirectories: z.array(z.string()).default([]),
    pluginOf: z.array(z.string()).default([]),
    broken: z.boolean().default(false),
    brokenReasons: z.array(z.string()).default([]),
  })
  .refine((entry) => entry.pkgId !== undefined || (entry.pkgname !== undefined && entry.pkgname.length > 0), {
    message: 'Need either a numeric pkgId or a non-empty pkgname',
  });

export type SeedEntry = z.infer<typeof seedEntrySchema>;

export const signalsSeedBodySchema = z.array(seedEntrySchema).describe('ELF analysis seed entries');

export type SignalsSeedBodyDto = z.infer<typeof signalsSeedBodySchema>;
