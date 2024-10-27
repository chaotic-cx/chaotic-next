import { CacheModule } from "@nestjs/cache-manager";
import { Module } from "@nestjs/common";
import { MetricsController } from "./metrics.controller";
import { MetricsService } from "./metrics.service";

@Module({
    imports: [CacheModule.register()],
    controllers: [MetricsController],
    providers: [MetricsService],
})
export class MetricsModule {}
