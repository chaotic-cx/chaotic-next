import { registerAs } from '@nestjs/config';

export interface RedisConnectionOptions {
  host: string;
  port: number;
  password?: string;
}

export function redisConnectionOptions(): RedisConnectionOptions {
  const password = process.env.REDIS_PASSWORD;
  return {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
    ...(password ? { password } : {}),
  };
}

export default registerAs('redis', () => redisConnectionOptions());
