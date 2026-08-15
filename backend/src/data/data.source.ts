import { Build, Builder, Repo, UpdateLastBuilderActive } from '../builder/builder.entity';
import { MrAction } from '../gitlab/mr-action.entity';
import { PipelineTrigger } from '../gitlab/pipeline-trigger.entity';
import { InitialSchema1786209704833 } from '../migrations/1786209704833-InitialSchema';
import { SignalScanOverhaul1786740989567 } from '../migrations/1786740989567-SignalScanOverhaul';
import { MrAction1786782432930 } from '../migrations/1786782432930-MrAction';
import { PipelineTrigger1786868832930 } from '../migrations/1786868832930-PipelineTrigger';
import { NotificationSubscription } from '../notifications/notification-subscription.entity';
import { ArchlinuxPackage, PackageBump, PackageElfAnalysis } from '../repo-manager/repo-manager.entity';
import { RouterHit } from '../router/router-hit.entity';
import { type DataSourceOptions } from 'typeorm';
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
  ],
  subscribers: [UpdateLastBuilderActive],
  migrations: [
    InitialSchema1786209704833,
    SignalScanOverhaul1786740989567,
    MrAction1786782432930,
    PipelineTrigger1786868832930,
  ],
  migrationsRun: true,
  cache: true,
};
