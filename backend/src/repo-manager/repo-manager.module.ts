import { Module } from "@nestjs/common";
import { RepoManagerController } from "./repo-manager.controller";
import { RepoManagerService } from "./repo-manager.service";
import { HttpModule } from "@nestjs/axios";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ArchlinuxPackage, RepoManagerSettings } from "./repo-manager.entity";
import { ConfigModule } from "@nestjs/config";
import repoManagerConfig from "../config/repo-manager.config";
import { Package, Repo } from "../builder/builder.entity";

@Module({
    imports: [
        HttpModule,
        ConfigModule.forFeature(repoManagerConfig),
        TypeOrmModule.forFeature([ArchlinuxPackage, Repo, RepoManagerSettings, Package]),
    ],
    controllers: [RepoManagerController],
    providers: [RepoManagerService],
})
export class RepoManagerModule {}