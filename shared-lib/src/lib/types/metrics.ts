import { z } from 'zod';
import { buildClassSchema } from './core';

export const statsObjectSchema = z.object({
  active: z.object({
    count: z.number(),
    packages: z.array(
      z.object({
        liveLog: z.string().optional(),
        name: z.string(),
        node: z.string(),
        build_class: buildClassSchema.nullable(),
      }),
    ),
  }),
  waiting: z.object({
    count: z.number(),
    packages: z.array(z.object({ name: z.string(), build_class: buildClassSchema })),
  }),
  idle: z.object({
    count: z.number(),
    nodes: z.array(z.object({ name: z.string(), build_class: buildClassSchema })),
  }),
});
export type StatsObject = z.infer<typeof statsObjectSchema>;

export const userAgentMetricSchema = z.object({
  name: z.string().describe('User agent string'),
  count: z.number().describe('Number of requests from this user agent'),
});
export type UserAgentMetric = z.infer<typeof userAgentMetricSchema>;

export type UserAgentList = UserAgentMetric[];

export const specificPackageMetricsSchema = z.object({
  name: z.string().optional().describe('Package name'),
  downloads: z.number().describe('Number of downloads'),
  user_agents: z.array(userAgentMetricSchema).describe('User agent breakdown for the package'),
});
export type SpecificPackageMetrics = z.infer<typeof specificPackageMetricsSchema>;

export const countNameObjectSchema = z.object({
  name: z.string().describe('Name (e.g. country or package)'),
  count: z.number().describe('Number of hits'),
});
export type CountNameObject = z.infer<typeof countNameObjectSchema>;

export type PackageRankList = CountNameObject[];

export const teamMemberSchema = z.object({
  name: z.string(),
  github: z.string(),
  avatarUrl: z.string().optional(),
  role: z.string().optional(),
  occupation: z.string().optional(),
});
export type TeamMember = z.infer<typeof teamMemberSchema>;

export type TeamList = TeamMember[];

export const liveTrafficHitSchema = z.object({
  id: z.string().describe('Unique hit event id'),
  timestamp: z.number().describe('Timestamp (epoch ms)'),
  countryCode: z.string().describe('Client two-letter ISO country code'),
  userHash: z.string().describe('Client hashed identity'),
  repo: z.string().describe('Repository or distro'),
  statusCode: z.number().describe('HTTP status code'),
  userAgent: z.string().describe('User-Agent header'),
  hostname: z.string().describe('Target mirror hostname'),
  worker: z.string().describe('Routing worker instance'),
});
export type LiveTrafficHit = z.infer<typeof liveTrafficHitSchema>;

export const LIVE_RPS_SSE_EVENT = 'rps';

export const liveRouterRpsSchema = z.object({ rps: z.number() });
export type LiveRouterRps = z.infer<typeof liveRouterRpsSchema>;

export const rpsHistorySampleSchema = z.object({
  timestamp: z.number().describe('Unix timestamp in milliseconds'),
  requests: z.number().describe('Requests during that second'),
});
export type RpsHistorySample = z.infer<typeof rpsHistorySampleSchema>;
