import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { RouterController } from "./router.controller";
import { Mirror, RouterHit } from "./router.entity";
import { RouterService } from "./router.service";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerBehindProxyGuard } from "../api/throttler-behind-proxy.guard";
import { BuilderModule } from "../builder/builder.module";

@Module({
    controllers: [RouterController],
    exports: [RouterService, TypeOrmModule],
    imports: [BuilderModule, TypeOrmModule.forFeature([RouterHit, Mirror])],
    providers: [
        RouterService,
        {
            provide: APP_GUARD,
            useClass: ThrottlerBehindProxyGuard,
        },
    ],
})
export class RouterModule {}
