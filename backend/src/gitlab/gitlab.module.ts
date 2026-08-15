import { HttpModule } from '@nestjs/axios';
import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Repo } from '../builder/builder.entity';
import { GitlabController } from './gitlab.controller';
import { GitlabService } from './gitlab.service';
import { MrAction } from './mr-action.entity';
import { PipelineTrigger } from './pipeline-trigger.entity';
import { EventModule } from '../events/event.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    CacheModule.register(),
    EventModule,
    HttpModule,
    NotificationsModule,
    TypeOrmModule.forFeature([MrAction, PipelineTrigger, Repo]),
  ],
  controllers: [GitlabController],
  providers: [GitlabService],
  exports: [GitlabService],
})
export class GitlabModule {}
