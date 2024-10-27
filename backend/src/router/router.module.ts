import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Package, Repo } from "../builder/builder.entity";
import { RouterController } from "./router.controller";
import { Mirror, RouterHit } from "./router.entity";
import { RouterService } from "./router.service";

@Module({
    controllers: [RouterController],
    exports: [TypeOrmModule],
    imports: [TypeOrmModule.forFeature([RouterHit, Package, Repo, Mirror])],
    providers: [RouterService],
})
export class RouterModule {}
