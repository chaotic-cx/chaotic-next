import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  dbKey: process.env.CAUR_DB_KEY,
  host: process.env.CAUR_HOST ?? '0.0.0.0',
  managerApiToken: process.env.CAUR_MANAGER_API_TOKEN,
  port: process.env.CAUR_PORT ?? 3000,
  buildServerUrl: process.env.BUILD_SERVER_URL ?? 'https://builds.garudalinux.org/api',
  garudaLogsUrl: process.env.GARUDA_LOGS_URL ?? 'https://builds.garudalinux.org/logs/api/logs',
  secretMirrorUrl: process.env.SECRET_MIRROR_URL ?? 'https://builds.garudalinux.org/repos',
}));
