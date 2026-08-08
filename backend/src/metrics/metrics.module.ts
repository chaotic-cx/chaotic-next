import { CAUR_METRICS_URL } from '@./shared-lib';
import { HttpModule } from '@nestjs/axios';
import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

@Module({
  controllers: [MetricsController],
  exports: [MetricsService],
  imports: [CacheModule.register(), HttpModule.register({ baseURL: CAUR_METRICS_URL })],
  providers: [MetricsService],
})
export class MetricsModule {}
