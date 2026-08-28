import { z } from 'zod';

export const envValidationSchema = z.looseObject({
  HTTP_LOGGING: z.enum(['true', 'false']).optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).optional(),
  CAUR_PORT: z.string().regex(/^\d+$/).optional(),
  PG_PORT: z.string().regex(/^\d+$/).optional(),
  REDIS_PORT: z.string().regex(/^\d+$/).optional(),
  PG_POOL_MAX: z.string().regex(/^\d+$/).optional(),
  PG_POOL_MIN: z.string().regex(/^\d+$/).optional(),
  CAUR_TRUST_PROXY: z.enum(['true', 'false']).optional(),
  REPOMANAGER_ABI_DRY_RUN: z.enum(['true', 'false']).optional(),
  REPOMANAGER_REGEN_DB: z.enum(['true', 'false']).optional(),
  REPOMANAGER_SIGNAL_SCAN_ENABLED: z.enum(['true', 'false']).optional(),
});
