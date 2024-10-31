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
import { MetricsModule } from "./metrics/metrics.module";
import { MiscModule } from "./misc/misc.module";
import { RouterModule } from "./router/router.module";
import { UsersModule } from "./users/users.module";
import { ThrottlerModule } from "@nestjs/throttler";
import { RepoManagerModule } from "./repo-manager/repo-manager.module";
import { TelegramModule } from "./telegram/telegram.module";

@Module({
    imports: [
        AuthModule,
        BuilderModule,
        ConfigModule.forRoot({ envFilePath: ".env", isGlobal: true, load: [appConfig] }),
        LoggerModule.forRoot({
            pinoHttp: {
                level: IS_PROD ? "info" : "debug",
            },
        }),
        MetricsModule,
        MiscModule,
        RepoManagerModule,
        RouterModule,
        TelegramModule,
        TerminusModule,
        ThrottlerModule.forRoot([
            {
                ttl: 60000,
                limit: 100,
            },
        ]),
        TypeOrmModule.forRoot({ ...dataSourceOptions, autoLoadEntities: true }),
        UsersModule,
    ],
})
export class AppModule {}
