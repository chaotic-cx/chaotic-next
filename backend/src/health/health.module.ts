import { DbHealthIndicator } from './db.health';
import { HealthController } from './health.controller';
import { RedisHealthIndicator } from './redis.health';
import { Module } from '@nestjs/common';

@Module({
  controllers: [HealthController],
  providers: [DbHealthIndicator, RedisHealthIndicator],
})
export class HealthModule {}
