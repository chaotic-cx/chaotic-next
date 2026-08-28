import { Package } from '../builder/builder.entity';
import aurConfig from '../config/aur.config';
import virustotalConfig from '../config/virustotal.config';
import { ArchlinuxPackage } from '../repo-manager/repo-manager.entity';
import { AurAuthService } from './aur-auth.service';
import { AurMaintainerInfoEntity } from './aur-maintainer-info.entity';
import { AurMaintainerSnapshot } from './aur-maintainer-snapshot.entity';
import { AurScanService } from './aur-scan.service';
import { DiffScanService } from './diff-scan.service';
import { DiffScanRuleData } from './rule-data.entity';
import { RuleDataService } from './rule-data.service';
import { VirusTotalVerdict } from './virus-total-verdict.entity';
import { VirustotalService } from './virustotal.service';
import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    CacheModule.register(),
    ConfigModule.forFeature(virustotalConfig),
    ConfigModule.forFeature(aurConfig),
    TypeOrmModule.forFeature([
      VirusTotalVerdict,
      AurMaintainerSnapshot,
      AurMaintainerInfoEntity,
      DiffScanRuleData,
      ArchlinuxPackage,
      Package,
    ]),
  ],
  providers: [AurScanService, DiffScanService, VirustotalService, AurAuthService, RuleDataService],
  exports: [AurScanService, DiffScanService, VirustotalService, AurAuthService],
})
export class DiffScanModule {}
