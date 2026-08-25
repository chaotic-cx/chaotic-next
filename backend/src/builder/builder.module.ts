import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import builderConfig from '../config/builder.config';
import { BuildApiController } from './build-api.controller';
import { BuilderController } from './builder.controller';
import { Build, Builder, Package, Repo, SilencedBuildFailure } from './builder.entity';
import { PackageLogsController } from './package-logs.controller';
import { BuilderService } from './builder.service';
import { BuildClassSuggesterService } from './build-class-suggester.service';
import { BuildClassSyncService } from './build-class-sync.service';
import { DatabaseCleanupService } from './database-cleanup.service';
import { PackageElfAnalysis } from '../repo-manager/repo-manager.entity';
import { HttpModule } from '@nestjs/axios';
import { RepoManagerModule } from '../repo-manager/repo-manager.module';
import { GitlabModule } from '../gitlab/gitlab.module';
import { EventModule } from '../events/event.module';

@Module({
  controllers: [BuildApiController, BuilderController, PackageLogsController],
  exports: [TypeOrmModule, BuilderService, BuildClassSuggesterService, BuildClassSyncService],
  imports: [
    ConfigModule.forFeature(builderConfig),
    EventModule,
    HttpModule,
    GitlabModule,
    forwardRef(() => RepoManagerModule),
    TypeOrmModule.forFeature([Builder, Build, Repo, Package, PackageElfAnalysis, SilencedBuildFailure]),
  ],
  providers: [BuilderService, BuildClassSuggesterService, BuildClassSyncService, DatabaseCleanupService],
})
export class BuilderModule {}
