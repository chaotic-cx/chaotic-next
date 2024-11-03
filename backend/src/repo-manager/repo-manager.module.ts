import { forwardRef, Module } from "@nestjs/common";
import { RepoManagerController } from "./repo-manager.controller";
import { RepoManagerService } from "./repo-manager.service";
import { HttpModule } from "@nestjs/axios";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ArchlinuxPackage, RepoManagerSettings } from "./repo-manager.entity";
import { ConfigModule } from "@nestjs/config";
import repoManagerConfig from "../config/repo-manager.config";
import { BuilderModule } from "../builder/builder.module";

@Module({
    controllers: [RepoManagerController],
    exports: [TypeOrmModule, RepoManagerService],
    imports: [
        forwardRef(() => BuilderModule),
        ConfigModule.forFeature(repoManagerConfig),
        HttpModule,
        TypeOrmModule.forFeature([ArchlinuxPackage, RepoManagerSettings]),
    ],
    providers: [RepoManagerService],
})
export class RepoManagerModule {}
