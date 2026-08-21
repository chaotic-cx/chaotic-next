import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Package } from '../builder/builder.entity';
import virustotalConfig from '../config/virustotal.config';
import { ArchlinuxPackage } from '../repo-manager/repo-manager.entity';
import { AurMaintainerSnapshot } from './aur-maintainer-snapshot.entity';
import { AurScanService } from './aur-scan.service';
import { DiffScanService } from './diff-scan.service';
import { VirusTotalVerdict } from './virus-total-verdict.entity';
import { VirustotalService } from './virustotal.service';

@Module({
  imports: [
    CacheModule.register(),
    ConfigModule.forFeature(virustotalConfig),
    TypeOrmModule.forFeature([VirusTotalVerdict, AurMaintainerSnapshot, ArchlinuxPackage, Package]),
  ],
  providers: [AurScanService, DiffScanService, VirustotalService],
  exports: [AurScanService, DiffScanService, VirustotalService],
})
export class DiffScanModule {}
