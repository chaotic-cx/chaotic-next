import { registerAs } from '@nestjs/config';

const TEMERAIRE_BOT = '20097372';

export default registerAs('app', () => ({
  dbKey: process.env.CAUR_DB_KEY,
  host: process.env.CAUR_HOST ?? '0.0.0.0',
  port: process.env.CAUR_PORT ?? 3000,
  mergeBotUserId: Number(process.env.CAUR_GITLAB_MERGE_BOT_USER_ID ?? TEMERAIRE_BOT),
  garudaLogsUrl: process.env.GARUDA_LOGS_URL ?? 'https://builds.garudalinux.org/logs/api/logs',
}));
