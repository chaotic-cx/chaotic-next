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

/** Global API throttling: 100 requests per minute per client. */
export const THROTTLE_TTL_MS = 60_000;
export const THROTTLE_LIMIT = 100;

/** Bounds for user-supplied query windows and pagination. */
export const MAX_DAYS_WINDOW = 3650;
export const MAX_DAYS_PER_DAY_CHART = 365;
export const MAX_AMOUNT = 100;
export const MAX_OFFSET = 10_000;

export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 100;
