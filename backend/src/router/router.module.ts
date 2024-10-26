import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Mirror, RouterHit } from "./router.entity";
import { Package, Repo } from "../builder/builder.entity";

@Module({
    controllers: [],
    exports: [TypeOrmModule],
    imports: [TypeOrmModule.forFeature([RouterHit, Package, Repo, Mirror])],
    providers: [],
})
export class RouterModule {}
