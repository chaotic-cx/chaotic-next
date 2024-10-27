import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Mirror, RouterHit } from "./router.entity";
import { Package, Repo } from "../builder/builder.entity";
import { RouterService } from "./router.service";
import { RouterController } from "./router.controller";
import { APP_GUARD } from "@nestjs/core";
import { JwtGuard } from "../auth/jwt.auth.guard";
import { ConfigModule } from "@nestjs/config";
import routerConfig from "../config/router.config";

@Module({
    controllers: [RouterController],
    exports: [TypeOrmModule],
    imports: [ConfigModule.forFeature(routerConfig), TypeOrmModule.forFeature([RouterHit, Package, Repo, Mirror])],
    providers: [RouterService, { provide: APP_GUARD, useClass: JwtGuard }],
})
export class RouterModule {}
