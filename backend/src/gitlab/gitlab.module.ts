import { HttpModule } from '@nestjs/axios';
import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { GitlabController } from './gitlab.controller';
import { GitlabService } from './gitlab.service';
import { EventModule } from '../events/event.module';

@Module({
  imports: [CacheModule.register(), EventModule, HttpModule],
  controllers: [GitlabController],
  providers: [GitlabService],
})
export class GitlabModule {}
