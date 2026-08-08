import { type DataSourceOptions } from 'typeorm';
import { Build, Builder, Repo } from './builder/builder.entity';
import { InitialSchema1786209704833 } from './migrations/1786209704833-InitialSchema';
import { ArchlinuxPackage, RepoManagerSettings } from './repo-manager/repo-manager.entity';
import { User } from './users/users.entity';

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.PG_HOST || 'localhost',
  port: Number(process.env.PG_PORT) || 5432,
  username: process.env.PG_USER || 'chaotic',
  password: process.env.PG_PASSWORD || 'chaotic',
  database: process.env.PG_DATABASE || 'chaotic',
  synchronize: false,
  entities: [Builder, Build, Repo, User, ArchlinuxPackage, RepoManagerSettings],
  migrations: [InitialSchema1786209704833],
  migrationsRun: true,
  cache: true,
  extra: {
    ssl: process.env.SSL_MODE === 'require' ? { rejectUnauthorized: false } : false,
  },
};
