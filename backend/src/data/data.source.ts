import { AddPackageBump1787139892583 } from '@chaotic-next/backend/migrations/1787139892583-AddPackageBump';
import { type DataSourceOptions } from 'typeorm';
import { Build, Builder, Repo, UpdateLastBuilderActive } from '../builder/builder.entity';
import { AurMaintainerSnapshot } from '../diff-scan/aur-maintainer-snapshot.entity';
import { VirusTotalVerdict } from '../diff-scan/virus-total-verdict.entity';
import { MrAction } from '../gitlab/mr-action.entity';
import { PipelineTrigger } from '../gitlab/pipeline-trigger.entity';
import { InitialSchema1786209704833 } from '../migrations/1786209704833-InitialSchema';
import { SignalScanOverhaul1786740989567 } from '../migrations/1786740989567-SignalScanOverhaul';
import { MrAction1786782432930 } from '../migrations/1786782432930-MrAction';
import { PipelineTrigger1786868832930 } from '../migrations/1786868832930-PipelineTrigger';
import { VirusTotalVerdict1786871992879 } from '../migrations/1786871992879-VirusTotalVerdict';
import { AurMaintainerSnapshot1786920000000 } from '../migrations/1786920000000-AurMaintainerSnapshot';
import { AuditCommitSha1786999414850 } from '../migrations/1786999414850-AuditCommitSha';
import { PipelineIdBigInt1787080648292 } from '../migrations/1787080648292-PipelineIdBigInt';
import { AddPackageCreatedAt1787146120924 } from '../migrations/1787146120924-AddPackageCreatedAt';
import { AddPackageRemovedAt1787147034396 } from '../migrations/1787147034396-AddPackageRemovedAt';
import { CleanupDuplicateInactiveRows1787149556087 } from '../migrations/1787149556087-CleanupDuplicateInactiveRows';
import { NotificationSubscription } from '../notifications/notification-subscription.entity';
import { ArchlinuxPackage, PackageBump, PackageElfAnalysis } from '../repo-manager/repo-manager.entity';
import { RouterHit } from '../router/router-hit.entity';
import { pgConnectionOptions } from './pg-options';

export const dataSourceOptions: DataSourceOptions = {
  ...pgConnectionOptions,
  synchronize: false,
  entities: [
    Builder,
    Build,
    Repo,
    NotificationSubscription,
    RouterHit,
    ArchlinuxPackage,
    PackageBump,
    PackageElfAnalysis,
    MrAction,
    PipelineTrigger,
    VirusTotalVerdict,
    AurMaintainerSnapshot,
  ],
  subscribers: [UpdateLastBuilderActive],
  migrations: [
    InitialSchema1786209704833,
    SignalScanOverhaul1786740989567,
    MrAction1786782432930,
    PipelineTrigger1786868832930,
    VirusTotalVerdict1786871992879,
    AurMaintainerSnapshot1786920000000,
    AuditCommitSha1786999414850,
    PipelineIdBigInt1787080648292,
    AddPackageBump1787139892583,
    AddPackageCreatedAt1787146120924,
    AddPackageRemovedAt1787147034396,
    CleanupDuplicateInactiveRows1787149556087,
  ],
  migrationsRun: true,
  cache: true,
};
