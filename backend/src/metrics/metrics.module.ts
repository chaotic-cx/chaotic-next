import { HttpModule } from '@nestjs/axios';
import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

@Module({
  controllers: [MetricsController],
  exports: [MetricsService],
  imports: [CacheModule.register(), HttpModule],
  providers: [MetricsService],
})
export class MetricsModule {}
