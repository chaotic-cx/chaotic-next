import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import builderConfig from "../config/builder.config";
import { BuilderController } from "./builder.controller";
import { Build, Builder, Package, Repo } from "./builder.entity";
import { BuilderService } from "./builder.service";

@Module({
    controllers: [BuilderController],
    exports: [TypeOrmModule],
    imports: [ConfigModule.forFeature(builderConfig), TypeOrmModule.forFeature([Builder, Build, Repo, Package])],
    providers: [BuilderService],
})
export class BuilderModule {}
