import 'reflect-metadata';
import { AppModule } from '@chaotic-next/backend/app.module';
import { Build, Builder, Package, Repo } from '@chaotic-next/backend/builder/builder.entity';
import { BuilderService } from '@chaotic-next/backend/builder/builder.service';
import { NotificationSubscription } from '@chaotic-next/backend/notifications/notification-subscription.entity';
import { MrAction as MrActionEntity } from '@chaotic-next/backend/gitlab/mr-action.entity';
import { PipelineTrigger as PipelineTriggerEntity } from '@chaotic-next/backend/gitlab/pipeline-trigger.entity';
import {
  ArchlinuxPackage,
  PackageBump as PackageBumpEntity,
  PackageElfAnalysis,
} from '@chaotic-next/backend/repo-manager/repo-manager.entity';
import { BuildStatus } from '@chaotic-next/backend/types/types';
import { RepoStatus } from '@chaotic-next/shared-lib';
import { utcDayStart } from '@chaotic-next/backend/utils/functions';
import { HLL_LOG2M } from '@chaotic-next/backend/utils/constants';
import { type Cache, CACHE_MANAGER } from '@nestjs/cache-manager';
import { Logger } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { AuthGuard } from '@thallesp/nestjs-better-auth';
import { DataSource } from 'typeorm';
import { ARCH_PACKAGES, BUILDERS, CHAOTIC_AUR_REPO, GARUDA_REPO } from './fixtures';

export interface RouterHitSeed {
  package: string;
  version: string;
  repo: string;
  arch: string;
  hostname: string;
  ip: string;
  country: string;
  userAgent?: string;
  timestamp?: Date;
}

export type BuilderSeed = Partial<Pick<Builder, 'name' | 'description' | 'builderClass' | 'isActive'>>;

export type RepoSeed = Partial<
  Pick<Repo, 'name' | 'repoUrl' | 'isActive' | 'status' | 'gitRef' | 'dbPath' | 'apiToken' | 'gitlabProjectId'>
>;

export type PackageSeed = Partial<
  Pick<Package, 'pkgname' | 'version' | 'isActive' | 'pkgrel' | 'bumpCount' | 'metadata'> & {
    repo: Repo;
  }
>;

export type BuildSeed = Partial<
  Pick<Build, 'buildClass' | 'status' | 'arch' | 'logUrl' | 'commit' | 'timeToEnd' | 'replaced'> & {
    pkgbase: Package;
    builder: Builder;
    repo: Repo;
  }
>;

export type ArchPackageSeed = Partial<
  Pick<ArchlinuxPackage, 'pkgname' | 'version' | 'pkgrel' | 'arch' | 'previousVersion' | 'metadata'>
>;

export type SubscriptionSeed = Partial<
  Pick<NotificationSubscription, 'endpoint' | 'p256dh' | 'auth' | 'expirationTime'>
>;

export type ElfAnalysisSeed = Partial<
  Pick<
    PackageElfAnalysis,
    | 'pkgType'
    | 'pkgId'
    | 'version'
    | 'files'
    | 'neededSonames'
    | 'providedSonames'
    | 'importedSymbols'
    | 'exportedSymbols'
    | 'vtables'
    | 'directoriesOwned'
    | 'directDirectories'
    | 'pluginOf'
    | 'broken'
    | 'brokenReasons'
  >
>;

export type E2eMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface E2eResponse<T = unknown> {
  statusCode: number;
  headers: Record<string, unknown>;
  body: string;
  json(): Promise<T>;
}

export type MrActionSeed = Partial<
  Pick<MrActionEntity, 'mergeRequestIid' | 'commitSha' | 'action' | 'userId' | 'userName'>
>;

export type PipelineTriggerSeed = Partial<
  Pick<
    PipelineTriggerEntity,
    'pipelineId' | 'ref' | 'commitSha' | 'operation' | 'inputs' | 'webUrl' | 'userId' | 'userName'
  >
>;

export type PackageBumpSeed = Partial<
  Pick<PackageBumpEntity, 'bumpType' | 'trigger' | 'triggerFrom' | 'details' | 'timestamp'> & { pkg: Package }
>;

export interface E2eApp {
  readonly app: NestFastifyApplication;
  readonly dataSource: DataSource;
  inject<T = unknown>(request: {
    method: E2eMethod;
    url: string;
    payload?: unknown;
    headers?: Record<string, string>;
  }): Promise<E2eResponse<T>>;
  seedRouterHits(rows: RouterHitSeed[]): Promise<void>;
  seedBuilder(overrides?: BuilderSeed): Promise<Builder>;
  seedRepo(overrides?: RepoSeed): Promise<Repo>;
  seedPackage(overrides?: PackageSeed): Promise<Package>;
  seedBuild(overrides?: BuildSeed): Promise<Build>;
  seedArchlinuxPackage(overrides?: ArchPackageSeed): Promise<ArchlinuxPackage>;
  seedNotificationSubscription(overrides?: SubscriptionSeed): Promise<NotificationSubscription>;
  seedElfAnalysis(overrides?: ElfAnalysisSeed): Promise<PackageElfAnalysis>;
  seedMrAction(overrides?: MrActionSeed): Promise<MrActionEntity>;
  seedPipelineTrigger(overrides?: PipelineTriggerSeed): Promise<PipelineTriggerEntity>;
  seedPackageBump(overrides?: PackageBumpSeed): Promise<PackageBumpEntity>;
  resetTables(): Promise<void>;
  close(): Promise<void>;
}

export async function createE2eApp(): Promise<E2eApp> {
  // `logger: false` below only silences the app's own logger; services log
  // through their own `new Logger()` instances, which route through the static
  // console logger unless it is overridden with no enabled levels.
  Logger.overrideLogger([]);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideGuard(AuthGuard)
    .useValue({ canActivate: () => true })
    .compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
    logger: false,
  });
  await app.init();
  await app.listen(0);

  const dataSource = app.get<DataSource>(DataSource);
  const cache = app.get<Cache>(CACHE_MANAGER);

  let builderCounter = 0;
  let repoCounter = 0;
  let pkgCounter = 0;

  return {
    app,
    dataSource,
    inject: (request) =>
      app.inject({
        method: request.method,
        url: request.url,
        payload: request.payload as Record<string, unknown> | undefined,
        headers: request.headers,
      }),
    seedRouterHits: (rows) => seedRouterHits(dataSource, rows),
    seedBuilder: (overrides) => seedBuilder(dataSource, overrides, () => builderCounter++),
    seedRepo: (overrides) => seedRepo(dataSource, overrides, () => repoCounter++),
    seedPackage: (overrides) => seedPackage(dataSource, overrides, () => pkgCounter++),
    seedBuild: (overrides) => seedBuild(dataSource, overrides),
    seedArchlinuxPackage: (overrides) => seedArchlinuxPackage(dataSource, overrides),
    seedNotificationSubscription: (overrides) => seedNotificationSubscription(dataSource, overrides),
    seedElfAnalysis: (overrides) => seedElfAnalysis(dataSource, overrides),
    seedMrAction: (overrides) => seedMrAction(dataSource, overrides),
    seedPipelineTrigger: (overrides) => seedPipelineTrigger(dataSource, overrides),
    seedPackageBump: (overrides) => seedPackageBump(dataSource, overrides),
    resetTables: async () => {
      await truncateTables(dataSource);
      await cache.clear();
    },
    close: async () => {
      try {
        const builderService = app.get(BuilderService);
        const connection = (builderService as unknown as { connection?: { disconnect(): void } }).connection;
        connection?.disconnect();
      } catch {
        // Ignore if BuilderService is not instantiated
      }
      await app.close();
    },
  };
}

const TABLES_TO_RESET = [
  'router-hits',
  'router_hits_daily',
  'router_hits_daily_agents',
  'router_hits_daily_users',
  'query-result-cache',
  'mr_action',
  'pipeline_trigger',
  'package_bump',
  'package_elf_analysis',
  'build',
  'package',
  'archlinux_package',
  'builder',
  'repo',
  'notification_subscription',
] as const;

export async function truncateTables(dataSource: DataSource): Promise<void> {
  for (const table of TABLES_TO_RESET) {
    await dataSource.query(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE`);
  }
}

async function seedBuilder(
  dataSource: DataSource,
  overrides: BuilderSeed | undefined,
  counter: () => number,
): Promise<Builder> {
  const repo = dataSource.getRepository(Builder);
  const real = BUILDERS[counter() % BUILDERS.length];
  return repo.save({
    name: overrides?.name ?? real.name,
    description: overrides?.description ?? real.description,
    builderClass: overrides?.builderClass ?? real.builderClass,
    isActive: overrides?.isActive ?? true,
  });
}

async function seedRepo(dataSource: DataSource, overrides: RepoSeed | undefined, counter: () => number): Promise<Repo> {
  const repo = dataSource.getRepository(Repo);
  const real = counter() % 2 === 0 ? CHAOTIC_AUR_REPO : GARUDA_REPO;
  return repo.save({
    name: overrides?.name ?? real.name,
    repoUrl: overrides?.repoUrl ?? real.repoUrl,
    isActive: overrides?.isActive ?? true,
    status: overrides?.status ?? RepoStatus.ACTIVE,
    gitRef: overrides?.gitRef ?? real.gitRef,
    dbPath: overrides?.dbPath ?? real.dbPath,
    apiToken: overrides?.apiToken ?? null,
    gitlabProjectId: overrides?.gitlabProjectId ?? ('gitlabProjectId' in real ? real.gitlabProjectId : null),
  });
}

const REAL_PACKAGES = [
  {
    pkgname: 'firedragon',
    version: '2:13.1.1',
    pkgrel: 1,
    metadata: { desc: 'FireDragon browser', buildDate: '2025-01-15T00:00:00Z' },
  },
  {
    pkgname: 'google-chrome',
    version: '151.0.7922.71',
    pkgrel: 1,
    metadata: { desc: 'The popular web browser by Google', buildDate: '2025-12-01T00:00:00Z' },
  },
  {
    pkgname: 'spotify',
    version: '1:1.2.92.147',
    pkgrel: 1,
    metadata: { desc: 'A proprietary music streaming service', buildDate: '2025-11-15T00:00:00Z' },
  },
  {
    pkgname: 'paru',
    version: '2.1.0',
    pkgrel: 2,
    metadata: { desc: 'Feature packed AUR helper', buildDate: '2025-10-01T00:00:00Z' },
  },
  {
    pkgname: 'yay',
    version: '13.0.1',
    pkgrel: 1,
    metadata: {
      desc: 'Yet another yogurt. Pacman wrapper and AUR helper written in go.',
      buildDate: '2025-09-15T00:00:00Z',
    },
  },
  {
    pkgname: 'gitkraken',
    version: '12.3.1',
    pkgrel: 1,
    metadata: {
      desc: 'The intuitive, fast, and beautiful cross-platform Git client.',
      buildDate: '2025-11-20T00:00:00Z',
    },
  },
  {
    pkgname: 'ayugram-desktop-git',
    version: '6.7.8.r12.gba8c1a6',
    pkgrel: 2,
    metadata: {
      desc: 'Desktop Telegram client with good customization and Ghost mode',
      buildDate: '2025-06-20T00:00:00Z',
    },
  },
  {
    pkgname: 'visual-studio-code-bin',
    version: '1.131.0',
    pkgrel: 1,
    metadata: { desc: 'Visual Studio Code (vscode) official binary version', buildDate: '2025-12-05T00:00:00Z' },
  },
] as const;

let repoCounterInternal = 1000;

async function seedPackage(
  dataSource: DataSource,
  overrides: PackageSeed | undefined,
  counter: () => number,
): Promise<Package> {
  const repo = dataSource.getRepository(Package);
  const real = REAL_PACKAGES[counter() % REAL_PACKAGES.length];
  const linkedRepo = overrides?.repo ?? (await seedRepo(dataSource, undefined, () => repoCounterInternal++));
  return repo.save({
    pkgname: overrides?.pkgname ?? real.pkgname,
    version: overrides?.version ?? real.version,
    isActive: overrides?.isActive ?? true,
    pkgrel: overrides?.pkgrel ?? real.pkgrel,
    bumpCount: overrides?.bumpCount ?? 0,
    metadata: overrides?.metadata ?? real.metadata,
    lastUpdated: new Date().toISOString(),
    repo: linkedRepo,
  });
}

let pkgCounterInternal = 0;
let builderCounterInternal = 0;

async function seedBuild(dataSource: DataSource, overrides: BuildSeed | undefined): Promise<Build> {
  const repo = dataSource.getRepository(Build);
  const pkgbase = overrides?.pkgbase ?? (await seedPackage(dataSource, undefined, () => pkgCounterInternal++));
  const builder = overrides?.builder ?? (await seedBuilder(dataSource, undefined, () => builderCounterInternal++));
  const linkedRepo =
    overrides?.repo ?? pkgbase.repo ?? (await seedRepo(dataSource, undefined, () => repoCounterInternal++));

  return repo.save({
    pkgbase,
    builder,
    repo: linkedRepo,
    buildClass: overrides?.buildClass ?? '5',
    status: overrides?.status ?? BuildStatus.SUCCESS,
    arch: overrides?.arch ?? 'x86_64',
    logUrl:
      overrides?.logUrl ??
      `https://builds.garudalinux.org/logs/logs.html?timestamp=${Date.now()}&id=${pkgbase.pkgname}`,
    commit: overrides?.commit ?? '4a70b438f76d5c8f6f739ea110f8c071efe8067f',
    timeToEnd: overrides?.timeToEnd ?? 1.5,
    replaced: overrides?.replaced ?? false,
  });
}

async function seedArchlinuxPackage(
  dataSource: DataSource,
  overrides: ArchPackageSeed | undefined,
): Promise<ArchlinuxPackage> {
  const repo = dataSource.getRepository(ArchlinuxPackage);
  const n = await repo.count();
  const real = ARCH_PACKAGES[n % ARCH_PACKAGES.length];
  return repo.save({
    pkgname: overrides?.pkgname ?? real.pkgname,
    version: overrides?.version ?? real.version,
    pkgrel: overrides?.pkgrel ?? 1,
    arch: overrides?.arch ?? 'x86_64',
    previousVersion: overrides?.previousVersion ?? null,
    metadata: overrides?.metadata ?? { desc: real.pkgname, buildDate: new Date().toISOString() },
  });
}

async function seedNotificationSubscription(
  dataSource: DataSource,
  overrides: SubscriptionSeed | undefined,
): Promise<NotificationSubscription> {
  const repo = dataSource.getRepository(NotificationSubscription);
  const n = await repo.count();
  return repo.save({
    endpoint: overrides?.endpoint ?? `https://fcm.googleapis.com/fcm/send/chaotic-test-${n}-${Date.now()}`,
    p256dh:
      overrides?.p256dh ?? 'BPWNRtrPfUjhwu8ST1Se2jfU0P_u5YJ0uo3xCovSkNEor1XY4ZX_HVriwh0T1_a3rvoD2oFymAxvNyUe4PthHXQ',
    auth: overrides?.auth ?? 'epJJES7PtVQ19YkI67dn6Ndf23U',
    expirationTime: overrides?.expirationTime ?? null,
  });
}

async function seedElfAnalysis(
  dataSource: DataSource,
  overrides: ElfAnalysisSeed | undefined,
): Promise<PackageElfAnalysis> {
  const repo = dataSource.getRepository(PackageElfAnalysis);

  let pkgId = overrides?.pkgId;
  const pkgType = overrides?.pkgType ?? '0';
  if (pkgId === undefined) {
    if (pkgType === '0') {
      const archPkg = await seedArchlinuxPackage(dataSource, undefined);
      pkgId = archPkg.id;
    } else {
      const pkg = await seedPackage(dataSource, undefined, () => pkgCounterInternal++);
      pkgId = pkg.id;
    }
  }

  return repo.save({
    pkgType,
    pkgId,
    version: overrides?.version ?? '2.4.0',
    files: overrides?.files ?? ['usr/lib/libacl.so.1', 'usr/bin/chacl', 'usr/bin/getfacl', 'usr/bin/setfacl'],
    neededSonames: overrides?.neededSonames ?? ['libacl.so.1', 'libc.so.6'],
    providedSonames: overrides?.providedSonames ?? ['libacl.so.1'],
    importedSymbols: overrides?.importedSymbols ?? ['acl_get_perm', 'acl_init', 'malloc'],
    exportedSymbols: overrides?.exportedSymbols ?? {
      'libacl.so.1': ['acl_get_entry', 'acl_valid', 'acl_create_entry'],
    },
    vtables: overrides?.vtables ?? {},
    directoriesOwned: overrides?.directoriesOwned ?? ['usr/bin', 'usr/include/acl', 'usr/lib', 'usr/share/doc/acl'],
    directDirectories: overrides?.directDirectories ?? ['usr/lib'],
    pluginOf: overrides?.pluginOf ?? [],
    broken: overrides?.broken ?? false,
    brokenReasons: overrides?.brokenReasons ?? [],
  });
}

async function seedMrAction(dataSource: DataSource, overrides: MrActionSeed | undefined): Promise<MrActionEntity> {
  const repo = dataSource.getRepository(MrActionEntity);
  return repo.save({
    mergeRequestIid: overrides?.mergeRequestIid ?? 101,
    action: overrides?.action ?? 'approve',
    userId: overrides?.userId ?? '12345',
    userName: overrides?.userName ?? 'Test User',
  });
}

async function seedPipelineTrigger(
  dataSource: DataSource,
  overrides: PipelineTriggerSeed | undefined,
): Promise<PipelineTriggerEntity> {
  const repo = dataSource.getRepository(PipelineTriggerEntity);
  const operation = overrides?.operation ?? 'Bump Packages';
  return repo.save({
    pipelineId: overrides?.pipelineId ?? 6001,
    ref: overrides?.ref ?? 'main',
    operation,
    inputs: overrides?.inputs ?? { operation, packages: 'nodejs:20' },
    webUrl: overrides?.webUrl ?? 'https://gitlab.com/chaotic-aur/pkgbuilds/-/pipelines/6001',
    userId: overrides?.userId ?? '12345',
    userName: overrides?.userName ?? 'Test User',
  });
}

async function seedPackageBump(
  dataSource: DataSource,
  overrides: PackageBumpSeed | undefined,
): Promise<PackageBumpEntity> {
  const repo = dataSource.getRepository(PackageBumpEntity);
  const pkg = overrides?.pkg ?? (await seedPackage(dataSource, undefined, () => pkgCounterInternal++));
  return repo.save({
    pkg,
    bumpType: overrides?.bumpType ?? 1,
    trigger: overrides?.trigger ?? 0,
    triggerFrom: overrides?.triggerFrom ?? 1,
    details: overrides?.details ?? ['rebuilt due to dependency update'],
    timestamp: overrides?.timestamp ?? new Date(),
  });
}

async function seedRouterHits(dataSource: DataSource, rows: RouterHitSeed[]): Promise<void> {
  if (rows.length === 0) return;
  const params: unknown[] = [];
  const values = rows
    .map((row, i) => {
      const base = i * 9;
      params.push(
        row.package,
        row.version,
        row.repo,
        row.arch,
        row.hostname,
        row.ip,
        row.country,
        row.userAgent ?? null,
        row.timestamp ?? new Date(),
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9})`;
    })
    .join(', ');

  await dataSource.query(
    `INSERT INTO "router-hits" ("package", "version", "repo", "arch", "hostname", "ip", "country", "user-agent", "timestamp")
     VALUES ${values}`,
    params,
  );

  // Router metrics are served from the daily rollup, so seed it alongside the
  // raw rows the same way the scheduled refresh aggregates them.
  const mainByKey = new Map<string, number>();
  const agentByKey = new Map<string, number>();
  for (const row of rows) {
    const day = utcDayStart(row.timestamp ?? new Date());
    const mainKey = `${day.getTime()}|${row.country}|${row.hostname}|${row.package}`;
    mainByKey.set(mainKey, (mainByKey.get(mainKey) ?? 0) + 1);
    const agentKey = `${day.getTime()}|${row.userAgent ?? ''}`;
    agentByKey.set(agentKey, (agentByKey.get(agentKey) ?? 0) + 1);
  }

  const mainParams: unknown[] = [];
  const mainValues = [...mainByKey.entries()].map(([key, count], i) => {
    const [dayMs, country, hostname, pkg] = key.split('|');
    const base = i * 5;
    mainParams.push(new Date(Number(dayMs)), country, hostname, pkg, count);
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
  });
  if (mainValues.length > 0) {
    await dataSource.query(
      `INSERT INTO "router_hits_daily" ("day", "country", "hostname", "package", "count")
       VALUES ${mainValues.join(', ')}`,
      mainParams,
    );
  }

  const agentParams: unknown[] = [];
  const agentValues = [...agentByKey.entries()].map(([key, count], i) => {
    const [dayMs, userAgent] = key.split('|');
    const base = i * 3;
    agentParams.push(new Date(Number(dayMs)), userAgent, count);
    return `($${base + 1}, $${base + 2}, $${base + 3})`;
  });
  if (agentValues.length > 0) {
    await dataSource.query(
      `INSERT INTO "router_hits_daily_agents" ("day", "user_agent", "count")
       VALUES ${agentValues.join(', ')}`,
      agentParams,
    );
  }

  const ipsByDay = new Map<number, Set<string>>();
  for (const row of rows) {
    const dayMs = utcDayStart(row.timestamp ?? new Date()).getTime();
    let ips = ipsByDay.get(dayMs);
    if (!ips) {
      ips = new Set<string>();
      ipsByDay.set(dayMs, ips);
    }
    ips.add(row.ip);
  }
  const userParams: unknown[] = [];
  const userPairs: string[] = [];
  for (const [dayMs, ips] of ipsByDay) {
    for (const ip of ips) {
      const base = userParams.length;
      userParams.push(new Date(dayMs), ip);
      userPairs.push(`($${base + 1}::timestamp, $${base + 2})`);
    }
  }
  if (userPairs.length > 0) {
    await dataSource.query(
      `INSERT INTO "router_hits_daily_users" ("day", "sketch")
       SELECT day, hll_add_agg(hll_hash_text(ip), ${HLL_LOG2M})
       FROM (VALUES ${userPairs.join(', ')}) AS hits(day, ip)
       GROUP BY day`,
      userParams,
    );
  }
}
