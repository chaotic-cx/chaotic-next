import { Package, Repo } from '../builder/builder.entity';
import { DiffScanModule } from '../diff-scan/diff-scan.module';
import { EventModule } from '../events/event.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { GitlabApiService } from './gitlab-api.service';
import { GitlabController } from './gitlab.controller';
import { GitlabJobTraceService } from './gitlab-job-trace.service';
import { GitlabMergeRequestService } from './gitlab-merge-request.service';
import { GitlabPackageOpsService } from './gitlab-package-ops.service';
import { GitlabPipelineService } from './gitlab-pipeline.service';
import { MrAction } from './mr-action.entity';
import { PipelineTrigger } from './pipeline-trigger.entity';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    DiffScanModule,
    EventModule,
    HttpModule,
    NotificationsModule,
    TypeOrmModule.forFeature([MrAction, Package, PipelineTrigger, Repo]),
  ],
  controllers: [GitlabController],
  providers: [
    GitlabApiService,
    GitlabMergeRequestService,
    GitlabPipelineService,
    GitlabJobTraceService,
    GitlabPackageOpsService,
  ],
  exports: [
    GitlabApiService,
    GitlabMergeRequestService,
    GitlabPipelineService,
    GitlabJobTraceService,
    GitlabPackageOpsService,
  ],
})
export class GitlabModule {}
