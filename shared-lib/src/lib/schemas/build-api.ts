import { z } from 'zod';

export interface SchedulePackageDto {
  pkgbase: string;
  build_class?: number | string;
  pkgnames?: string[];
  dependencies?: string[];
}

export interface ScheduleDto {
  arch?: string;
  source_repo?: string;
  target_repo?: string;
  commit?: string;
  packages: SchedulePackageDto[];
  arch_mirror?: string;
}

export const scheduleBuildBodySchema = z.strictObject({
  packages: z.array(z.string()).min(1).describe('Package names to schedule for building'),
  source_repo: z.string().optional().describe('Source repository name'),
  target_repo: z.string().optional().describe('Target repository name'),
});

export type ScheduleBuildDto = z.infer<typeof scheduleBuildBodySchema>;

export const promoteBodySchema = z.strictObject({
  pkgbase: z.string().describe('Package base name'),
  arch: z.string().describe('Target architecture'),
  target_repo: z.string().describe('Target repository name'),
});

export type PromoteDto = z.infer<typeof promoteBodySchema>;
