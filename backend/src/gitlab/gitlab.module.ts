import { HttpModule } from '@nestjs/axios';
import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Package, Repo } from '../builder/builder.entity';
import { DiffScanModule } from '../diff-scan/diff-scan.module';
import { EventModule } from '../events/event.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { GitlabController } from './gitlab.controller';
import { GitlabService } from './gitlab.service';
import { MrAction } from './mr-action.entity';
import { PipelineTrigger } from './pipeline-trigger.entity';

@Module({
  imports: [
    CacheModule.register(),
    DiffScanModule,
    EventModule,
    HttpModule,
    NotificationsModule,
    TypeOrmModule.forFeature([MrAction, Package, PipelineTrigger, Repo]),
  ],
  controllers: [GitlabController],
  providers: [GitlabService],
  exports: [GitlabService],
})
export class GitlabModule {}
