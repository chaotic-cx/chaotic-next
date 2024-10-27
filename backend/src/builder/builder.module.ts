import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Build, Builder, Package, Repo } from "./builder.entity";
import { BuilderController } from "./builder.controller";
import { BuilderService } from "./builder.service";

@Module({
    controllers: [BuilderController],
    exports: [TypeOrmModule],
    imports: [TypeOrmModule.forFeature([Builder, Build, Repo, Package])],
    providers: [BuilderService],
})
export class BuilderModule {}
