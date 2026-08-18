import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BumpService } from './bump';
import { GitlabRepoReaderFactory, GitlabRepoWriter, REPO_READER_FACTORY, REPO_WRITER } from './repo-rw';
import { Package, Repo } from '../builder/builder.entity';
import { BuilderModule } from '../builder/builder.module';
import repoManagerConfig from '../config/repo-manager.config';
import { ArchMirrorService } from './arch-mirror.service';
import { ChaoticIndexService } from './chaotic-index.service';
import { RebuildTriggerService, SignalScanService } from './scan';
import { RepoManagerController } from './repo-manager.controller';
import { ArchlinuxPackage, PackageBump, PackageElfAnalysis } from './repo-manager.entity';
import { RepoManagerService } from './repo-manager.service';
import { SeedTransferService } from './seed-transfer.service';

@Module({
  controllers: [RepoManagerController],
  exports: [TypeOrmModule, RepoManagerService, SignalScanService, SeedTransferService],
  imports: [
    forwardRef(() => BuilderModule),
    ConfigModule.forFeature(repoManagerConfig),
    HttpModule,
    TypeOrmModule.forFeature([ArchlinuxPackage, PackageBump, PackageElfAnalysis, Package, Repo]),
  ],
  providers: [
    RepoManagerService,
    SignalScanService,
    SeedTransferService,
    ArchMirrorService,
    ChaoticIndexService,
    RebuildTriggerService,
    BumpService,
    { provide: REPO_WRITER, useClass: GitlabRepoWriter },
    { provide: REPO_READER_FACTORY, useClass: GitlabRepoReaderFactory },
  ],
})
export class RepoManagerModule {}
