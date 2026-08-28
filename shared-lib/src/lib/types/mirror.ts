import { z } from 'zod';

export const mirrorSchema = z.object({
  subdomain: z.string(),
  latlon: z.tuple([z.number(), z.number()]).optional(),
  healthy: z.boolean(),
  last_update: z.number(),
  geo_active: z.boolean(),
  official: z.boolean(),
});
export type Mirror = z.infer<typeof mirrorSchema>;

export const mirrorSelfSchema = z.object({
  addr: z.string(),
  latlon: z.tuple([z.number(), z.number()]).optional(),
  geo: z.string(),
});
export type MirrorSelf = z.infer<typeof mirrorSelfSchema>;

export const mirrorDataSchema = z.object({
  self: mirrorSelfSchema,
  mirrors: z.array(mirrorSchema),
});
export type MirrorData = z.infer<typeof mirrorDataSchema>;
