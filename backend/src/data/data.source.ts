import { Build, Builder, Repo, UpdateLastBuilderActive } from '../builder/builder.entity';
import { InitialSchema1786209704833 } from '../migrations/1786209704833-InitialSchema';
import { SignalScanOverhaul1786740989567 } from '../migrations/1786740989567-SignalScanOverhaul';
import { NotificationSubscription } from '../notifications/notification-subscription.entity';
import { ArchlinuxPackage, PackageBump, PackageElfAnalysis } from '../repo-manager/repo-manager.entity';
import { RouterHit } from '../router/router-hit.entity';
import { type DataSourceOptions } from 'typeorm';

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.PG_HOST || 'localhost',
  port: Number(process.env.PG_PORT) || 5432,
  username: process.env.PG_USER || 'chaotic',
  password: process.env.PG_PASSWORD || 'chaotic',
  database: process.env.PG_DATABASE || 'chaotic',
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
  ],
  subscribers: [UpdateLastBuilderActive],
  migrations: [InitialSchema1786209704833, SignalScanOverhaul1786740989567],
  migrationsRun: true,
  cache: true,
  extra: {
    ssl:
      process.env.SSL_MODE === 'require'
        ? { rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED !== 'false' }
        : false,
    max: Number(process.env.PG_POOL_MAX) || 25,
    min: Number(process.env.PG_POOL_MIN) || 2,
  },
};
