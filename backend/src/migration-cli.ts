import { DataSource } from 'typeorm';
import { Builder, Build, Repo, Package } from './builder/builder.entity';
import { ArchlinuxPackage, PackageBump, RepoManagerSettings } from './repo-manager/repo-manager.entity';
import { User } from './users/users.entity';
import { InitialSchema1786209704833 } from './migrations/1786209704833-InitialSchema';

export default new DataSource({
  type: 'postgres',
  host: process.env.PG_HOST || 'localhost',
  port: Number(process.env.PG_PORT) || 5432,
  username: process.env.PG_USER || 'chaotic',
  password: process.env.PG_PASSWORD || 'chaotic',
  database: process.env.PG_DATABASE || 'chaotic',
  entities: [Builder, Build, Repo, Package, User, ArchlinuxPackage, PackageBump, RepoManagerSettings],
  migrations: [InitialSchema1786209704833],
});
