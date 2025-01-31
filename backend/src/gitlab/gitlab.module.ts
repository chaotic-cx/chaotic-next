import { HttpModule } from '@nestjs/axios';
import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { GitlabController } from './gitlab.controller';
import { GitlabService } from './gitlab.service';

@Module({
  imports: [CacheModule.register(), HttpModule],
  controllers: [GitlabController],
  providers: [GitlabService],
})
export class GitlabModule {}
