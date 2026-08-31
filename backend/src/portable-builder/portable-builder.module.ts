import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiffScanModule } from '../diff-scan/diff-scan.module';
import { ArtifactScanService } from './artifact-scan.service';
import { DockerService } from './docker.service';
import { PortableBuild } from './portable-build.entity';
import { PortableBuilderController } from './portable-builder.controller';
import { PortableBuilderService } from './portable-builder.service';

@Module({
  imports: [DiffScanModule, TypeOrmModule.forFeature([PortableBuild])],
  controllers: [PortableBuilderController],
  providers: [DockerService, ArtifactScanService, PortableBuilderService],
  exports: [PortableBuilderService],
})
export class PortableBuilderModule {}
