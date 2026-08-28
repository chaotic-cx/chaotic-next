import { z } from 'zod';
import { buildClassSchema } from './core';
import type { MergeRequestWithDiffs, PipelineWithExternalStatus } from './gitlab';
import { BuildStatus } from './build';
import { moleculerCurrentQueueObjectSchema } from './queue';

export const chaoticEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('build'),
    package: z.string(),
    version: z.string(),
    pkgrel: z.number(),
    bump: z.number(),
    duration: z.number(),
    repo: z.string(),
    status: z.enum(BuildStatus),
  }),
  z.object({
    type: z.literal('pipeline'),
    pipeline: z.array(z.custom<PipelineWithExternalStatus>()),
  }),
  z.object({
    type: z.literal('merge_request'),
    hasNewMr: z.boolean(),
    mr: z.array(z.custom<MergeRequestWithDiffs>()),
  }),
  moleculerCurrentQueueObjectSchema.extend({ type: z.literal('queue') }),
  z.object({
    type: z.literal('queue_promoted'),
    arch: z.string(),
    pkgbase: z.string(),
    target_repo: z.string(),
    timestamp: z.number(),
  }),
]);
export type ChaoticEvent = z.infer<typeof chaoticEventSchema>;

export const notificationPayloadSchema = z.object({
  notification: z.object({
    title: z.string(),
    icon: z.string(),
    body: z.string(),
    data: z.object({
      onActionClick: z.object({
        default: z.object({
          operation: z.enum(['openWindow', 'navigateLastFocusedOrOpen']),
          url: z.string(),
        }),
      }),
    }),
  }),
});
export type NotificationPayload = z.infer<typeof notificationPayloadSchema>;
