import { CacheModule } from "@nestjs/cache-manager"
import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { MetricsController } from "./metrics/metrics.controller"
import { MetricsService } from "./metrics/metrics.service"
import { MiscController } from "./misc/misc.controller"
import { MiscService } from "./misc/misc.service"
import { TelegramController } from "./telegram/telegram.controller"
import { TelegramService } from "./telegram/telegram.service"

@Module({
    imports: [
        ConfigModule.forRoot({ envFilePath: ".env" }),
        CacheModule.register(),
    ],
    controllers: [TelegramController, MetricsController, MiscController],
    providers: [TelegramService, MetricsService, MiscService],
})
export class AppModule {}
