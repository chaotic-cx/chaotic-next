import type { ParsedPackageMetadata } from '@chaotic-next/shared-lib';
import { RepoStatus } from '@chaotic-next/shared-lib';
import { Logger } from '@nestjs/common';
import { Mutex } from 'async-mutex';
import { BuildStatus } from '../types/types';
import {
  Column,
  CreateDateColumn,
  DeepPartial,
  Entity,
  type EntitySubscriberInterface,
  EventSubscriber,
  In,
  Index,
  type InsertEvent,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Repository,
  type UpdateResult,
} from 'typeorm';

const moduleLogger = new Logger('BuilderEntity');

@Entity()
@Index('IDX_builder_name', ['name'])
export class Builder {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar' })
  name!: string;

  @Column({ type: 'varchar', nullable: true })
  description!: string;

  @Column({ type: 'varchar', nullable: true })
  builderClass!: string | null;

  @Column({ type: 'boolean', nullable: true })
  isActive!: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastActive!: Date;
}

@Entity()
@Index('IDX_repo_name', ['name'])
export class Repo {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('varchar')
  name!: string;

  @Column({ type: 'varchar', nullable: true })
  repoUrl!: string;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'int', nullable: true })
  status!: RepoStatus;

  @Column({ type: 'varchar', default: 'main' })
  gitRef!: string;

  @Column({ type: 'varchar', nullable: true })
  dbPath!: string;

  @Column({ type: 'varchar', nullable: true })
  apiToken!: string | null;

  @Column({ type: 'varchar', nullable: true })
  gitlabProjectId!: string | null;
}

@Entity()
@Index('IDX_package_pkgname', ['pkgname'])
@Index('IDX_package_active', ['isActive'], { where: '"isActive" = true' })
@Index('IDX_package_repoId', ['repo'])
export class Package {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('varchar')
  pkgname!: string;

  @Column({ type: 'timestamp', nullable: true })
  lastUpdated!: string;

  @Column({ type: 'boolean', nullable: false, default: true })
  isActive!: boolean;

  @Column({ type: 'boolean', nullable: false, default: false })
  skipSignalScan!: boolean;

  @Column({ type: 'varchar', nullable: true })
  version!: string;

  @Column({ type: 'int', nullable: true })
  bumpCount!: number;

  @Column({ type: 'jsonb', nullable: true })
  bumpTriggers!: { pkgname: string; archVersion: string }[] | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: ParsedPackageMetadata;

  @Column({ type: 'int', nullable: true })
  pkgrel!: number;

  @ManyToOne(() => Repo, (repo) => repo.id, { cascade: true, nullable: true })
  repo!: Repo;
}

@Entity()
@Index('IDX_build_pkgbaseId', ['pkgbase'])
@Index('IDX_build_builderId', ['builder'])
@Index('IDX_build_repoId', ['repo'])
@Index('IDX_build_timestamp', ['timestamp'])
@Index('IDX_build_status', ['status'])
export class Build {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Package, (pkg) => pkg.id, { cascade: true })
  pkgbase!: Package;

  @Column({ type: 'varchar', nullable: true })
  buildClass!: string;

  @ManyToOne(() => Builder, (builder) => builder.id, { cascade: true, nullable: true })
  builder!: Builder;

  @ManyToOne(() => Repo, (repo) => repo.id, { cascade: true, nullable: true })
  repo!: Repo;

  @Column({ type: 'enum', enum: BuildStatus, default: BuildStatus.SUCCESS })
  status!: BuildStatus;

  @CreateDateColumn()
  timestamp!: Date;

  @Column({ type: 'varchar', nullable: true })
  arch!: string;

  @Column({ type: 'varchar', nullable: true })
  logUrl!: string;

  @Column({ type: 'varchar', nullable: true })
  commit!: string;

  @Column({ type: 'float', nullable: true })
  timeToEnd!: number;

  @Column({ type: 'boolean', nullable: true })
  replaced!: boolean;
}

/**
 * Keeps `Builder.lastActive` current: every inserted build touches its builder.
 * Registered explicitly via the `subscribers` array in the DataSource options.
 * The update runs through the event manager so it joins the same transaction.
 */
@EventSubscriber()
export class UpdateLastBuilderActive implements EntitySubscriberInterface<Build> {
  beforeInsert(event: InsertEvent<Build>): Promise<UpdateResult> | void {
    const builderId = event.entity.builder?.id;
    if (!builderId) return;
    return event.manager.update(Builder, { id: builderId }, { lastActive: new Date() });
  }
}

// Mutexes to prevent double entries
const pkgnameMutex = new Mutex();
const builderMutex = new Mutex();
const repoMutex = new Mutex();

export async function getOrCreatePackage(
  pkgname: string,
  connection: Repository<Package>,
  repo: Repo,
): Promise<Package> {
  return pkgnameMutex.runExclusive(async () => {
    const packages: Package[] = await connection.find({
      where: { pkgname },
      relations: {
        repo: true,
      },
    });
    let packageExists: Package | undefined = packages.find((pkg) => {
      return pkg.repo?.name === repo.name;
    });

    if (packageExists === undefined) {
      moduleLogger.log(`Package ${pkgname} not found in database, creating new entry`);
      moduleLogger.debug(`Associated repo: ${repo.name}`);
      packageExists = await connection.save({
        pkgname: pkgname,
        repo: repo,
        lastUpdated: new Date().toISOString(),
        isActive: true,
      });
    }

    return packageExists;
  });
}

export async function getOrCreateBuilder(name: string, connection: Repository<Builder>): Promise<Builder> {
  return builderMutex.runExclusive(async () => {
    const builders: Builder[] = await connection.find({ where: { name } });
    let getOrCreateBuilder: Builder | undefined = builders.find((builder) => {
      return name === builder.name;
    });

    if (getOrCreateBuilder === undefined) {
      moduleLogger.log(`Builder ${name} not found in database, creating new entry`);
      getOrCreateBuilder = await connection.save({
        name: name,
        isActive: false,
        description: `Added on ${new Date().toISOString()}`,
      });
    }

    return getOrCreateBuilder;
  });
}

export async function getOrCreateRepo(name: string, connection: Repository<Repo>): Promise<Repo> {
  return repoMutex.runExclusive(async () => {
    const repos: Repo[] = await connection.find({ where: { name: name } });
    let getOrCreateRepo: Repo | undefined = repos.find((repo) => {
      return name === repo.name;
    });

    if (getOrCreateRepo === undefined) {
      moduleLogger.log(`Repo ${name} not found in database, creating new entry`);
      getOrCreateRepo = await connection.save({
        name: name,
      });
    }

    return getOrCreateRepo;
  });
}

export async function bulkGetOrCreatePackages(
  entries: { pkgname: string; repo: Repo }[],
  connection: Repository<Package>,
): Promise<Map<string, Package>> {
  const byKey = new Map<string, Package>();
  if (entries.length === 0) return byKey;

  const names = [...new Set(entries.map((e) => e.pkgname))];
  const existing = await connection.find({ where: { pkgname: In(names) }, relations: { repo: true } });
  for (const pkg of existing) {
    if (pkg.repo) byKey.set(`${pkg.repo.name}:${pkg.pkgname}`, pkg);
  }

  const toCreate: { pkgname: string; repo: Repo }[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    const key = `${e.repo.name}:${e.pkgname}`;
    if (byKey.has(key) || seen.has(key)) continue;
    seen.add(key);
    toCreate.push(e);
  }
  if (toCreate.length > 0) {
    const created = await connection.save(
      toCreate.map(
        (e) =>
          ({
            pkgname: e.pkgname,
            repo: e.repo,
            lastUpdated: new Date().toISOString(),
            isActive: true,
          }) as DeepPartial<Package>,
      ),
    );
    for (const row of Array.isArray(created) ? created : [created]) {
      if (row.repo) byKey.set(`${row.repo.name}:${row.pkgname}`, row);
    }
  }
  return byKey;
}
