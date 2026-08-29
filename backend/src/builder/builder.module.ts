import { EventModule } from '../events/event.module';
import builderConfig from '../config/builder.config';
import { GitlabModule } from '../gitlab/gitlab.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PackageElfAnalysis } from '../repo-manager/repo-manager.entity';
import { RepoManagerModule } from '../repo-manager/repo-manager.module';
import { BuildApiController } from './build-api.controller';
import { BuildClassSuggesterService } from './build-class-suggester.service';
import { BuildClassSyncService } from './build-class-sync.service';
import { BuildFailureNotifierService } from './build-failure-notifier.service';
import { BuilderController } from './builder.controller';
import { Build, Builder, Package, Repo, SilencedBuildFailure } from './builder.entity';
import { BuilderService } from './builder.service';
import { EntityLookupService } from './entity-lookup.service';
import { DatabaseCleanupService } from './database-cleanup.service';
import { PackageLogsController } from './package-logs.controller';
import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  controllers: [BuildApiController, BuilderController, PackageLogsController],
  exports: [TypeOrmModule, BuilderService, BuildClassSuggesterService, BuildClassSyncService, EntityLookupService],
  imports: [
    ConfigModule.forFeature(builderConfig),
    EventModule,
    HttpModule,
    GitlabModule,
    NotificationsModule,
    forwardRef(() => RepoManagerModule),
    TypeOrmModule.forFeature([Builder, Build, Repo, Package, PackageElfAnalysis, SilencedBuildFailure]),
  ],
  providers: [
    BuilderService,
    BuildClassSuggesterService,
    BuildClassSyncService,
    BuildFailureNotifierService,
    DatabaseCleanupService,
    EntityLookupService,
  ],
})
export class BuilderModule {}
