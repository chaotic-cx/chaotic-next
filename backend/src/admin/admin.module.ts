import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Builder, Package, Repo } from '../builder/builder.entity';
import { MrAction } from '../gitlab/mr-action.entity';
import { PipelineTrigger } from '../gitlab/pipeline-trigger.entity';
import { ArchlinuxPackage, PackageBump, PackageElfAnalysis } from '../repo-manager/repo-manager.entity';
import { RepoManagerModule } from '../repo-manager/repo-manager.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  controllers: [AdminController],
  imports: [
    HttpModule,
    RepoManagerModule,
    TypeOrmModule.forFeature([
      Package,
      Repo,
      ArchlinuxPackage,
      Builder,
      MrAction,
      PipelineTrigger,
      PackageBump,
      PackageElfAnalysis,
    ]),
  ],
  providers: [AdminService],
})
export class AdminModule {}
