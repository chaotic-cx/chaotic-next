import { z } from 'zod';

export const pushSubscriptionBodySchema = z.strictObject({
  endpoint: z.string().min(1).max(500).describe('Push service endpoint URL (HTTPS, allowlisted provider)'),
  // Browsers send an epoch number; anything `new Date()` accepts is allowed.
  expirationTime: z.union([z.number(), z.string()]).nullable().optional(),
  keys: z.strictObject({
    p256dh: z.string().min(1).describe('Client public key'),
    auth: z.string().min(1).describe('Authentication secret'),
  }),
});

export type PushSubscriptionBodyDto = z.infer<typeof pushSubscriptionBodySchema>;
