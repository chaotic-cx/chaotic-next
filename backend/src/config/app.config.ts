import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  dbKey: process.env.CAUR_DB_KEY,
  host: process.env.CAUR_HOST ?? '0.0.0.0',
  port: process.env.CAUR_PORT ?? 3000,
  garudaLogsUrl: process.env.GARUDA_LOGS_URL ?? 'https://builds.garudalinux.org/logs/api/logs',
}));
