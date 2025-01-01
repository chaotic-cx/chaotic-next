import { Module } from '@nestjs/common';
import { GitlabController } from './gitlab.controller';
import { GitlabService } from './gitlab.service';
import { HttpModule } from '@nestjs/axios';
import { CacheModule } from 'nestjs-omacache';

@Module({
  imports: [CacheModule, HttpModule],
  controllers: [GitlabController],
  providers: [GitlabService],
})
export class GitlabModule {}
