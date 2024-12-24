import { registerAs } from '@nestjs/config';

export default registerAs('telegram', () => ({
  hash: process.env.TELEGRAM_API_HASH,
  appId: process.env.TELEGRAM_API_ID,
  encryptionKey: process.env.TELEGRAM_DB_ENCRYPTION_KEY,
}));
