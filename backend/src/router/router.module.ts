import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { RouterController } from "./router.controller";
import { RouterHit } from "./router.entity";
import { RouterService } from "./router.service";

@Module({
    controllers: [RouterController],
    exports: [TypeOrmModule],
    imports: [TypeOrmModule.forFeature([RouterHit])],
    providers: [RouterService],
})
export class RouterModule {}
