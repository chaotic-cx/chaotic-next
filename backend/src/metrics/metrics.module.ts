import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

@Module({
  imports: [HttpModule],
  controllers: [MetricsController],
  exports: [MetricsService],
  providers: [MetricsService],
})
export class MetricsModule {}
