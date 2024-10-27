import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtGuard } from "../auth/jwt.auth.guard";
import { Package, Repo } from "../builder/builder.entity";
import { RouterController } from "./router.controller";
import { Mirror, RouterHit } from "./router.entity";
import { RouterService } from "./router.service";

@Module({
    controllers: [RouterController],
    exports: [TypeOrmModule],
    imports: [TypeOrmModule.forFeature([RouterHit, Package, Repo, Mirror])],
    providers: [RouterService, { provide: APP_GUARD, useClass: JwtGuard }],
})
export class RouterModule {}
