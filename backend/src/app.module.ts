import { CacheModule } from "@nestjs/cache-manager";
import { type MiddlewareConsumer, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BuilderController } from "./builder/builder.controller";
import { BuilderModule } from "./builder/builder.module";
import { BuilderService } from "./builder/builder.service";
import { HttpLoggerMiddleware } from "./http-logger/httplogger.middleware";
import { MetricsController } from "./metrics/metrics.controller";
import { MetricsService } from "./metrics/metrics.service";
import { MiscController } from "./misc/misc.controller";
import { MiscService } from "./misc/misc.service";
import { TelegramController } from "./telegram/telegram.controller";
import { TelegramService } from "./telegram/telegram.service";
import { PG_OPTIONS } from "./constants";
import { Build, Builder, Repo } from "./builder/builder.entity";

@Module({
    imports: [
        BuilderModule,
        CacheModule.register(),
        ConfigModule.forRoot({ envFilePath: ".env" }),
        TypeOrmModule.forRoot({
            type: "postgres",
            ...PG_OPTIONS,
            entities: [Builder, Build, Repo],
            autoLoadEntities: true,
        }),
    ],
    controllers: [TelegramController, MetricsController, MiscController, BuilderController],
    providers: [TelegramService, MetricsService, MiscService, BuilderService],
})
export class AppModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(HttpLoggerMiddleware).forRoutes("*");
    }
}
