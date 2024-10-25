import { Module } from "@nestjs/common";
import { MetricsService } from "./metrics.service";

@Module({
    controllers: [],
    providers: [MetricsService],
})
export class MetricsModule {}
