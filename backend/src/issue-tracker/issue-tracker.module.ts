import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Package } from '../builder/builder.entity';
import { ArchlinuxPackage } from '../repo-manager/repo-manager.entity';
import { DiffScanModule } from '../diff-scan/diff-scan.module';
import { PortableBuilderModule } from '../portable-builder/portable-builder.module';
import { GithubIssuesService } from './github-issues.service';
import { IssueTrackerController } from './issue-tracker.controller';
import { IssueTrackerService } from './issue-tracker.service';
import { NewPackageSubscriber, SuccessfulBuildSubscriber } from './issue-closure.subscriber';

@Module({
  imports: [DiffScanModule, PortableBuilderModule, TypeOrmModule.forFeature([Package, ArchlinuxPackage])],
  controllers: [IssueTrackerController],
  providers: [GithubIssuesService, IssueTrackerService, NewPackageSubscriber, SuccessfulBuildSubscriber],
})
export class IssueTrackerModule {}
