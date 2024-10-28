import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Package, Repo } from "../builder/builder.entity";
import { RouterController } from "./router.controller";
import { Mirror, RouterHit } from "./router.entity";
import { RouterService } from "./router.service";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerBehindProxyGuard } from "../api/throttler-behind-proxy.guard";

@Module({
    controllers: [RouterController],
    exports: [TypeOrmModule],
    imports: [TypeOrmModule.forFeature([RouterHit, Package, Repo, Mirror])],
    providers: [
        RouterService,
        {
            provide: APP_GUARD,
            useClass: ThrottlerBehindProxyGuard,
        },
    ],
})
export class RouterModule {}
