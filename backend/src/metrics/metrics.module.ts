import { Module } from "@nestjs/common";
import { MetricsService } from "./metrics.service";
import { MetricsController } from "./metrics.controller";

@Module({
    controllers: [MetricsController],
    providers: [MetricsService],
})
export class MetricsModule {}
