export const requiredEnvVarsProd: string[] = [
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_TRUSTED_ORIGINS',
  'PG_DATABASE',
  'PG_HOST',
  'PG_PASSWORD',
  'PG_USER',
  'REDIS_PASSWORD',
  'REDIS_SSH_HOST',
  'REDIS_SSH_USER',
];

export const requiredEnvVarsDev: string[] = [
  'BETTER_AUTH_SECRET',
  'PG_DATABASE',
  'PG_HOST',
  'PG_PASSWORD',
  'PG_USER',
  'REDIS_PASSWORD',
];

export const ARCH = 'x86_64';

export const CACHE_TTL_MS = 30_000;

/** Long-lived TTL for expensive router/metrics aggregations, refreshed by the rollup cron. */
export const METRICS_CACHE_TTL_MS = 21_600_000;

/** Global API throttling: 100 requests per minute per client. */
export const THROTTLE_TTL_MS = 60_000;
export const THROTTLE_LIMIT = 100;

/** AUR scan throttling: each scan fans out to multiple aur.archlinux.org requests. */
export const AUR_SCAN_THROTTLE_TTL_MS = 60_000;
export const AUR_SCAN_THROTTLE_LIMIT = 5;

/** Throttling for endpoints that proxy to external services. */
export const EXTERNAL_PROXY_THROTTLE_TTL_MS = 60_000;
export const AUR_SEARCH_THROTTLE_LIMIT = 20;
export const PIPELINE_JOBS_THROTTLE_LIMIT = 30;

/** Bounds for user-supplied query windows and pagination. */
export const MAX_DAYS_WINDOW = 3650;
/** Bit sample size (log2 registers) for per-day distinct-user HyperLogLog sketches. */
export const HLL_LOG2M = 12;
export const MAX_AMOUNT = 100;
export const MAX_OFFSET = 10_000;
