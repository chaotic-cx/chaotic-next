import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Package } from '../builder/builder.entity';
import virustotalConfig from '../config/virustotal.config';
import aurConfig from '../config/aur.config';
import { ArchlinuxPackage } from '../repo-manager/repo-manager.entity';
import { AurMaintainerSnapshot } from './aur-maintainer-snapshot.entity';
import { AurMaintainerInfoEntity } from './aur-maintainer-info.entity';
import { AurAuthService } from './aur-auth.service';
import { AurScanService } from './aur-scan.service';
import { DiffScanService } from './diff-scan.service';
import { VirusTotalVerdict } from './virus-total-verdict.entity';
import { VirustotalService } from './virustotal.service';

@Module({
  imports: [
    CacheModule.register(),
    ConfigModule.forFeature(virustotalConfig),
    ConfigModule.forFeature(aurConfig),
    TypeOrmModule.forFeature([
      VirusTotalVerdict,
      AurMaintainerSnapshot,
      AurMaintainerInfoEntity,
      ArchlinuxPackage,
      Package,
    ]),
  ],
  providers: [AurScanService, DiffScanService, VirustotalService, AurAuthService],
  exports: [AurScanService, DiffScanService, VirustotalService, AurAuthService],
})
export class DiffScanModule {}
