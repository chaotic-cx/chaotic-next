import { CacheModule } from "@nestjs/cache-manager";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BuilderController } from "./builder/builder.controller";
import { BuilderModule } from "./builder/builder.module";
import { BuilderService } from "./builder/builder.service";
import { MetricsController } from "./metrics/metrics.controller";
import { MetricsService } from "./metrics/metrics.service";
import { MiscController } from "./misc/misc.controller";
import { MiscService } from "./misc/misc.service";
import { TelegramController } from "./telegram/telegram.controller";
import { TelegramService } from "./telegram/telegram.service";
import { IS_PROD, PG_OPTIONS } from "./constants";
import { Build, Builder, Repo } from "./builder/builder.entity";
import { RouterService } from "./router/router.service";
import { RouterController } from "./router/router.controller";
import { RouterModule } from "./router/router.module";
import { Mirror, RouterHit } from "./router/router.entity";
import { LoggerModule } from "nestjs-pino";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { User } from "./users/users.entity";
import { AuthController } from "./auth/auth.controller";
import { UsersService } from "./users/users.service";
import { AuthService } from "./auth/auth.service";

@Module({
    imports: [
        AuthModule,
        BuilderModule,
        CacheModule.register({}),
        ConfigModule.forRoot({ envFilePath: ".env", isGlobal: true }),
        LoggerModule.forRoot({
            pinoHttp: {
                level: IS_PROD ? "info" : "debug",
            },
        }),
        RouterModule,
        TypeOrmModule.forRoot({
            type: "postgres",
            ...PG_OPTIONS,
            entities: [Builder, Build, Repo, RouterHit, Mirror, User],
            autoLoadEntities: true,
        }),
        UsersModule,
    ],
    controllers: [
        AuthController,
        BuilderController,
        MetricsController,
        MiscController,
        RouterController,
        TelegramController,
    ],
    providers: [TelegramService, MetricsService, MiscService, BuilderService, RouterService, UsersService, AuthService],
})
export class AppModule {}
