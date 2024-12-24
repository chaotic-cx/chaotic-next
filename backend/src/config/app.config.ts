import { registerAs } from '@nestjs/config';
import { IS_PROD } from '../constants';

export default registerAs('app', () => ({
  dbKey: process.env.CAUR_DB_KEY,
  host: process.env.CAUR_HOST ?? '0.0.0.0',
  port: process.env.CAUR_PORT ?? 3000,
  prod: IS_PROD,
}));
