import { Module } from "@nestjs/common";
import { MetricsController } from "./metrics.controller";
import { MetricsService } from "./metrics.service";
import { CacheModule } from "@nestjs/cache-manager";

@Module({
    imports: [CacheModule.register()],
    controllers: [MetricsController],
    providers: [MetricsService],
})
export class MetricsModule {}
