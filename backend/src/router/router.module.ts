import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Mirror, RouterHit } from "./router.entity";
import { RouterService } from "./router.service";
import { Package, Repo } from "../builder/builder.entity";

@Module({
    controllers: [],
    exports: [TypeOrmModule],
    imports: [TypeOrmModule.forFeature([RouterHit, Package, Repo, Mirror])],
    providers: [RouterService],
})
export class RouterModule {}
