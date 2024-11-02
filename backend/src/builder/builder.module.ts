import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import builderConfig from "../config/builder.config";
import { BuilderController } from "./builder.controller";
import { Build, Builder, Package, Repo } from "./builder.entity";
import { BuilderService } from "./builder.service";
import { RepoManagerModule } from "../repo-manager/repo-manager.module";
import { RepoManagerService } from "../repo-manager/repo-manager.service";

@Module({
    controllers: [BuilderController],
    exports: [TypeOrmModule],
    imports: [
        ConfigModule.forFeature(builderConfig),
        RepoManagerModule,
        TypeOrmModule.forFeature([Builder, Build, Repo, Package]),
    ],
    providers: [BuilderService, RepoManagerService],
})
export class BuilderModule {}
