import { CacheModule } from "@nestjs/cache-manager";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import telegramConfig from "../config/telegram.config";
import { TelegramController } from "./telegram.controller";
import { TelegramService } from "./telegram.service";

@Module({
    imports: [CacheModule.register(), ConfigModule.forFeature(telegramConfig)],
    controllers: [TelegramController],
    providers: [TelegramService],
})
export class TelegramModule {}
