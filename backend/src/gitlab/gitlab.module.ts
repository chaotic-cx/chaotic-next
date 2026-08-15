import { HttpModule } from '@nestjs/axios';
import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { GitlabController } from './gitlab.controller';
import { GitlabService } from './gitlab.service';
import { EventModule } from '../events/event.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [CacheModule.register(), EventModule, HttpModule, NotificationsModule],
  controllers: [GitlabController],
  providers: [GitlabService],
  exports: [GitlabService],
})
export class GitlabModule {}
