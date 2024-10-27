import { CacheModule } from "@nestjs/cache-manager";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TerminusModule } from "@nestjs/terminus";
import { TypeOrmModule } from "@nestjs/typeorm";
import { LoggerModule } from "nestjs-pino";
import { AuthModule } from "./auth/auth.module";
import { BuilderModule } from "./builder/builder.module";
import appConfig from "./config/app.config";
import { IS_PROD } from "./constants";
import { dataSourceOptions } from "./data.source";
import { RouterModule } from "./router/router.module";
import { TelegramModule } from "./telegram/telegram.module";
import { UsersModule } from "./users/users.module";
import { MetricsModule } from "./metrics/metrics.module";
import { MiscModule } from "./misc/misc.module";

@Module({
    imports: [
        AuthModule,
        BuilderModule,
        CacheModule.register({}),
        ConfigModule.forRoot({ envFilePath: ".env", isGlobal: true, load: [appConfig] }),
        LoggerModule.forRoot({
            pinoHttp: {
                level: IS_PROD ? "info" : "debug",
            },
        }),
        MetricsModule,
        MiscModule,
        RouterModule,
        TelegramModule,
        TerminusModule,
        TypeOrmModule.forRoot({ ...dataSourceOptions, autoLoadEntities: true }),
        UsersModule,
    ],
})
export class AppModule {}
