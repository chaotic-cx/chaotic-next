import { DataSource, type DataSourceOptions } from 'typeorm';
import { Build, Builder, Repo } from './builder/builder.entity';
import { IS_PROD } from './constants';
import { ArchlinuxPackage, RepoManagerSettings } from './repo-manager/repo-manager.entity';
import { Mirror, RouterHit } from './router/router.entity';
import { User } from './users/users.entity';

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.PG_HOST || 'localhost',
  port: Number(process.env.PG_PORT) || 5432,
  username: process.env.PG_USER || 'chaotic',
  password: process.env.PG_PASSWORD || 'chaotic',
  database: process.env.PG_DATABASE || 'chaotic',
  synchronize: !IS_PROD,
  entities: [Builder, Build, Repo, RouterHit, Mirror, User, ArchlinuxPackage, RepoManagerSettings],
  migrations: [],
  cache: true,
  extra: {
    ssl: process.env.SSL_MODE === 'require' ? { rejectUnauthorized: false } : false,
  },
};

export const appDataSource: DataSource = new DataSource(dataSourceOptions);
