import { errorMessage } from '../utils/functions';
import IORedis from 'ioredis';
import { HealthCheckError, type HealthIndicatorResult } from './health.types';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RedisHealthIndicator {
  constructor(private readonly configService: ConfigService) {}

  async pingCheck(key: string, timeout = 1000): Promise<HealthIndicatorResult> {
    const redis = new IORedis(
      this.configService.get<number>('redis.port') ?? 6379,
      this.configService.get<string>('redis.host') ?? 'localhost',
      {
        password: this.configService.get<string>('redis.password'),
        lazyConnect: true,
        connectTimeout: timeout,
      },
    );
    try {
      await redis.connect();
      await redis.ping();
      return { [key]: { status: 'up' } };
    } catch (err) {
      throw new HealthCheckError('Redis check failed', {
        [key]: { status: 'down', message: errorMessage(err) },
      });
    } finally {
      redis.disconnect();
    }
  }
}
