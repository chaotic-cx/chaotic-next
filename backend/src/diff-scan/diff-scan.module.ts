import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import virustotalConfig from '../config/virustotal.config';
import { DiffScanService } from './diff-scan.service';
import { VirusTotalVerdict } from './virus-total-verdict.entity';
import { VirustotalService } from './virustotal.service';

@Module({
  imports: [
    CacheModule.register(),
    ConfigModule.forFeature(virustotalConfig),
    TypeOrmModule.forFeature([VirusTotalVerdict]),
  ],
  providers: [DiffScanService, VirustotalService],
  exports: [DiffScanService, VirustotalService],
})
export class DiffScanModule {}
