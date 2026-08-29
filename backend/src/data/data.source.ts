import { Build, Builder, Repo, SilencedBuildFailure, UpdateLastBuilderActive } from '../builder/builder.entity';
import { AurMaintainerInfoEntity } from '../diff-scan/aur-maintainer-info.entity';
import { AurMaintainerSnapshot } from '../diff-scan/aur-maintainer-snapshot.entity';
import { DiffScanRuleData } from '../diff-scan/rule-data.entity';
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
import { AddPackageBump1787139892583 } from '../migrations/1787139892583-AddPackageBump';
import { AddPackageCreatedAt1787146120924 } from '../migrations/1787146120924-AddPackageCreatedAt';
import { AddPackageRemovedAt1787147034396 } from '../migrations/1787147034396-AddPackageRemovedAt';
import { CleanupDuplicateInactiveRows1787149556087 } from '../migrations/1787149556087-CleanupDuplicateInactiveRows';
import { AddManualBumpType1787174029311 } from '../migrations/1787174029311-AddManualBumpType';
import { RouterHitsDailyRollup1787184527000 } from '../migrations/1787184527000-RouterHitsDailyRollup';
import { RouterHitsDailyUsers1787192834000 } from '../migrations/1787192834000-RouterHitsDailyUsers';
import { AddHasCompiledCode1787402061455 } from '../migrations/1787402061455-AddHasCompiledCode';
import { AddBuildResourceStats1787428076689 } from '../migrations/1787428076689-AddBuildResourceStats';
import { AddIsSourceCompiled1787477203212 } from '../migrations/1787477203212-AddIsSourceCompiled';
import { AddAurMaintainerInfo1787477206135 } from '../migrations/1787477206135-AddAurMaintainerInfo';
import { DiffScanRuleData1787511302520 } from '../migrations/1787511302520-DiffScanRuleData';
import { AddPackageBuildClass1787594553238 } from '../migrations/1787594553238-AddPackageBuildClass';
import { AddPackagePkgbaseName1787600183572 } from '../migrations/1787600183572-AddPackagePkgbaseName';
import { AddSilencedBuildFailure1787692800000 } from '../migrations/1787692800000-AddSilencedBuildFailure';
import { RouterHitsDailyRepo1787790000000 } from '../migrations/1787790000000-RouterHitsDailyRepo';
import { UniqueEntityNames1787949377345 } from '../migrations/1787949377345-UniqueEntityNames';
import { AddBuildFailureTags1787988202747 } from '../migrations/1787988202747-AddBuildFailureTags';
import { AddNotificationUserAndPreferences1787992018243 } from '../migrations/1787992018243-AddNotificationUserAndPreferences';
import { NotificationPreference } from '../notifications/notification-preference.entity';
import { NotificationSubscription } from '../notifications/notification-subscription.entity';
import { ArchlinuxPackage, PackageBump, PackageElfAnalysis } from '../repo-manager/repo-manager.entity';
import { RouterHitDailyAgent } from '../router/router-hit-daily-agent.entity';
import { RouterHitDaily } from '../router/router-hit-daily.entity';
import { RouterHit } from '../router/router-hit.entity';
import { pgConnectionOptions } from './pg-options';
import { type DataSourceOptions } from 'typeorm';

export const dataSourceOptions: DataSourceOptions = {
  ...pgConnectionOptions,
  synchronize: false,
  entities: [
    Builder,
    Build,
    Repo,
    SilencedBuildFailure,
    NotificationSubscription,
    NotificationPreference,
    RouterHit,
    RouterHitDaily,
    RouterHitDailyAgent,
    ArchlinuxPackage,
    PackageBump,
    PackageElfAnalysis,
    MrAction,
    PipelineTrigger,
    VirusTotalVerdict,
    AurMaintainerSnapshot,
    AurMaintainerInfoEntity,
    DiffScanRuleData,
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
    AddManualBumpType1787174029311,
    RouterHitsDailyRollup1787184527000,
    RouterHitsDailyUsers1787192834000,
    AddHasCompiledCode1787402061455,
    AddBuildResourceStats1787428076689,
    AddIsSourceCompiled1787477203212,
    AddAurMaintainerInfo1787477206135,
    DiffScanRuleData1787511302520,
    AddPackageBuildClass1787594553238,
    AddPackagePkgbaseName1787600183572,
    AddSilencedBuildFailure1787692800000,
    RouterHitsDailyRepo1787790000000,
    UniqueEntityNames1787949377345,
    AddBuildFailureTags1787988202747,
    AddNotificationUserAndPreferences1787992018243,
  ],
  migrationsRun: true,
  cache: true,
};
