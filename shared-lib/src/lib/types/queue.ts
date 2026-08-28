import { z } from 'zod';
import { buildClassSchema } from './core';

export const moleculerCurrentQueueObjectSchema = z.object({
  count: z.number(),
  labels: z.object({
    build_class: z.array(buildClassSchema),
    pkgname: z.array(z.string()),
    target_repo: z.array(z.string()),
  }),
});
export type MoleculerCurrentQueueObject = z.infer<typeof moleculerCurrentQueueObjectSchema>;
