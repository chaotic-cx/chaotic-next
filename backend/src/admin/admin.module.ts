import { Builder, Package, Repo, SilencedBuildFailure } from '../builder/builder.entity';
import { BuilderModule } from '../builder/builder.module';
import { MrAction } from '../gitlab/mr-action.entity';
import { PipelineTrigger } from '../gitlab/pipeline-trigger.entity';
import { ArchlinuxPackage, PackageBump, PackageElfAnalysis } from '../repo-manager/repo-manager.entity';
import { RepoManagerModule } from '../repo-manager/repo-manager.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  controllers: [AdminController],
  imports: [
    HttpModule,
    RepoManagerModule,
    BuilderModule,
    TypeOrmModule.forFeature([
      Package,
      Repo,
      ArchlinuxPackage,
      Builder,
      MrAction,
      PipelineTrigger,
      PackageBump,
      PackageElfAnalysis,
      SilencedBuildFailure,
    ]),
  ],
  providers: [AdminService],
})
export class AdminModule {}
