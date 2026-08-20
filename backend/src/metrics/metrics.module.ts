import { Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

@Module({
  controllers: [MetricsController],
  exports: [MetricsService],
  providers: [MetricsService],
})
export class MetricsModule {}
