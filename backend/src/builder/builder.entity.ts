import type { ParsedPackageMetadata } from '@chaotic-next/shared-lib';
import { RepoStatus } from '@chaotic-next/shared-lib';
import { Logger } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Mutex } from 'async-mutex';
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
import { BuildStatus } from '../types/types';

const moduleLogger = new Logger('BuilderEntity');

@Entity()
@Index('IDX_builder_name', ['name'])
export class Builder {
  @ApiProperty({ description: 'Builder ID' })
  @PrimaryGeneratedColumn()
  id!: number;

  @ApiProperty({ description: 'Builder name' })
  @Column({ type: 'varchar' })
  name!: string;

  @ApiProperty({ description: 'Builder description' })
  @Column({ type: 'varchar', nullable: true })
  description!: string;

  @ApiProperty({ description: 'Builder class' })
  @Column({ type: 'varchar', nullable: true })
  builderClass!: string | null;

  @ApiProperty({ description: 'Whether the builder is active' })
  @Column({ type: 'boolean', nullable: true })
  isActive!: boolean;

  @ApiProperty({ description: 'When the builder was last active (ISO 8601)' })
  @Column({ type: 'timestamp', nullable: true })
  lastActive!: Date;
}

@Entity()
@Index('IDX_repo_name', ['name'])
export class Repo {
  @ApiProperty({ description: 'Repo ID' })
  @PrimaryGeneratedColumn()
  id!: number;

  @ApiProperty({ description: 'Repo name' })
  @Column('varchar')
  name!: string;

  @ApiProperty({ description: 'Repo URL' })
  @Column({ type: 'varchar', nullable: true })
  repoUrl!: string;

  @ApiProperty({ description: 'Whether the repo is active' })
  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @ApiProperty({ description: 'Repo status', enum: RepoStatus, enumName: 'RepoStatus' })
  @Column({ type: 'int', nullable: true })
  status!: RepoStatus;

  @ApiProperty({ description: 'Git ref watched for changes' })
  @Column({ type: 'varchar', default: 'main' })
  gitRef!: string;

  @ApiProperty({ description: 'Local database path' })
  @Column({ type: 'varchar', nullable: true })
  dbPath!: string;

  @ApiProperty({ description: 'API token for the repo' })
  @Column({ type: 'varchar', nullable: true })
  apiToken!: string | null;

  @ApiProperty({ description: 'GitLab project ID' })
  @Column({ type: 'varchar', nullable: true })
  gitlabProjectId!: string | null;
}

@Entity()
@Index('IDX_package_pkgname', ['pkgname'])
@Index('IDX_package_active', ['isActive'], { where: '"isActive" = true' })
@Index('IDX_package_repoId', ['repo'])
export class Package {
  @ApiProperty({ description: 'Package ID' })
  @PrimaryGeneratedColumn()
  id!: number;

  @ApiProperty({ description: 'Package name' })
  @Column('varchar')
  pkgname!: string;

  @ApiProperty({ description: 'When the package was last updated (ISO 8601)' })
  @Column({ type: 'timestamp', nullable: true })
  lastUpdated!: string;

  @ApiProperty({ description: 'When the package was first added (ISO 8601)' })
  @Column({ type: 'timestamp', nullable: true })
  createdAt!: string;

  @ApiProperty({ description: 'When the package was removed / deactivated (ISO 8601), null while active' })
  @Column({ type: 'timestamp', nullable: true })
  removedAt!: string | null;

  @ApiProperty({ description: 'Whether the package is active' })
  @Column({ type: 'boolean', nullable: false, default: true })
  isActive!: boolean;

  @ApiProperty({ description: 'Whether signal scanning is skipped for this package' })
  @Column({ type: 'boolean', nullable: false, default: false })
  skipSignalScan!: boolean;

  @ApiProperty({ description: 'Current package version' })
  @Column({ type: 'varchar', nullable: true })
  version!: string;

  @ApiProperty({ description: 'Number of bumps' })
  @Column({ type: 'int', nullable: true })
  bumpCount!: number;

  @ApiProperty({ description: 'Bump trigger entries', type: [Object] })
  @Column({ type: 'jsonb', nullable: true })
  bumpTriggers!: { pkgname: string; archVersion: string }[] | null;

  @ApiProperty({ description: 'Parsed package metadata', type: Object })
  @Column({ type: 'jsonb', nullable: true })
  metadata!: ParsedPackageMetadata;

  @ApiProperty({ description: 'Package release number' })
  @Column({ type: 'int', nullable: true })
  pkgrel!: number;

  @ApiProperty({ description: 'Chaotic-AUR rebuild indicator (fractional part of a non-integer pkgrel)' })
  @Column({ type: 'int', default: 0 })
  bump!: number;

  @ApiProperty({ description: 'Owning repo', type: () => Repo })
  @ManyToOne(() => Repo, (repo) => repo.id, { cascade: true, nullable: true })
  repo!: Repo;
}

export class BuildResourceUsage {
  @ApiProperty({ description: 'Mean of all sampled memory usage values in bytes' })
  @Column({ name: 'resourceStatsAvgMemoryBytes', type: 'bigint', nullable: true })
  avgMemoryBytes!: number | null;

  @ApiProperty({ description: 'Total CPU time consumed by the container in nanoseconds' })
  @Column({ name: 'resourceStatsCpuTimeNs', type: 'bigint', nullable: true })
  cpuTimeNs!: number | null;

  @ApiProperty({ description: 'Total bytes read from block devices by the container' })
  @Column({ name: 'resourceStatsDiskReadBytes', type: 'bigint', nullable: true })
  diskReadBytes!: number | null;

  @ApiProperty({ description: 'Total bytes written to block devices by the container' })
  @Column({ name: 'resourceStatsDiskWriteBytes', type: 'bigint', nullable: true })
  diskWriteBytes!: number | null;

  @ApiProperty({ description: 'How long the build container was running, in milliseconds' })
  @Column({ name: 'resourceStatsDurationMs', type: 'int', nullable: true })
  durationMs!: number | null;

  @ApiProperty({ description: 'Total bytes received over all network interfaces during the build' })
  @Column({ name: 'resourceStatsNetworkRxBytes', type: 'bigint', nullable: true })
  networkRxBytes!: number | null;

  @ApiProperty({ description: 'Total bytes sent over all network interfaces during the build' })
  @Column({ name: 'resourceStatsNetworkTxBytes', type: 'bigint', nullable: true })
  networkTxBytes!: number | null;

  @ApiProperty({ description: 'Highest observed memory usage in bytes' })
  @Column({ name: 'resourceStatsPeakMemoryBytes', type: 'bigint', nullable: true })
  peakMemoryBytes!: number | null;

  @ApiProperty({ description: 'Highest number of processes observed inside the container' })
  @Column({ name: 'resourceStatsPeakPids', type: 'int', nullable: true })
  peakPids!: number | null;

  @ApiProperty({ description: 'How many samples the aggregation is based on' })
  @Column({ name: 'resourceStatsSampleCount', type: 'int', nullable: true })
  sampleCount!: number | null;
}

@Entity()
@Index('IDX_build_pkgbaseId', ['pkgbase'])
@Index('IDX_build_builderId', ['builder'])
@Index('IDX_build_repoId', ['repo'])
@Index('IDX_build_timestamp', ['timestamp'])
@Index('IDX_build_status', ['status'])
export class Build {
  @ApiProperty({ description: 'Build ID' })
  @PrimaryGeneratedColumn()
  id!: number;

  @ApiProperty({ description: 'Built package', type: () => Package })
  @ManyToOne(() => Package, (pkg) => pkg.id, { cascade: true })
  pkgbase!: Package;

  @ApiProperty({ description: 'Build class' })
  @Column({ type: 'varchar', nullable: true })
  buildClass!: string;

  @ApiProperty({ description: 'Builder that ran the build', type: () => Builder })
  @ManyToOne(() => Builder, (builder) => builder.id, { cascade: true, nullable: true })
  builder!: Builder;

  @ApiProperty({ description: 'Repo the build belongs to', type: () => Repo })
  @ManyToOne(() => Repo, (repo) => repo.id, { cascade: true, nullable: true })
  repo!: Repo;

  @ApiProperty({ description: 'Build status', enum: BuildStatus, enumName: 'BuildStatus' })
  @Column({ type: 'enum', enum: BuildStatus, default: BuildStatus.SUCCESS })
  status!: BuildStatus;

  @ApiProperty({ description: 'When the build was created (ISO 8601)' })
  @CreateDateColumn()
  timestamp!: Date;

  @ApiProperty({ description: 'Target architecture' })
  @Column({ type: 'varchar', nullable: true })
  arch!: string;

  @ApiProperty({ description: 'Build log URL' })
  @Column({ type: 'varchar', nullable: true })
  logUrl!: string;

  @ApiProperty({ description: 'Commit hash of the build' })
  @Column({ type: 'varchar', nullable: true })
  commit!: string;

  @ApiProperty({ description: 'Time until the build finished, in seconds' })
  @Column({ type: 'float', nullable: true })
  timeToEnd!: number;

  @ApiProperty({ description: 'Whether the build was replaced by a newer one' })
  @Column({ type: 'boolean', nullable: true })
  replaced!: boolean;

  @ApiProperty({
    description: 'Aggregated container resource usage of the build, all fields null when it was never sampled',
    type: BuildResourceUsage,
    nullable: true,
  })
  @Column(() => BuildResourceUsage, { prefix: false })
  resourceStats!: BuildResourceUsage;
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
        createdAt: new Date().toISOString(),
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
            createdAt: new Date().toISOString(),
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
