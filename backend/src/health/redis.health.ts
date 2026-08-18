import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import IORedis from 'ioredis';
import { errorMessage } from '../utils/functions';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(private readonly configService: ConfigService) {
    super();
  }

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
      return this.getStatus(key, true);
    } catch (err) {
      throw new HealthCheckError('Redis check failed', this.getStatus(key, false, { message: errorMessage(err) }));
    } finally {
      redis.disconnect();
    }
  }
}
