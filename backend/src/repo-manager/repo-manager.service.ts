import { RepoStatus } from '@chaotic-next/shared-lib';
import { HttpService } from '@nestjs/axios';
import { Inject, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { CronJob } from 'cron';
import { PinoLogger } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { In, IsNull, Not, Repository } from 'typeorm';
import { Build, Package, Repo } from '../builder/builder.entity';
import {
  BrokenPackageReport,
  BumpLogEntry,
  BumpResult,
  IndexResult,
  PackageRebuildTriggerSources,
  RebuildTriggerSourcePackage,
  RepoSettings,
  SonameDependency,
  TriggerType,
} from '../interfaces/repo-manager';
import { bumpTypeToText, encryptAes, errorMessage } from '../utils/functions';
import { ArchMirrorService } from './arch-mirror.service';
import { BumpService, parseCiConfig } from './bump';
import { ChaoticIndexService } from './chaotic-index.service';
import { RepoManager } from './repo-manager';
import { ArchlinuxPackage, PackageBump, PackageElfAnalysis } from './repo-manager.entity';
import { REPO_READER_FACTORY, REPO_WRITER, type RepoReader, type RepoReaderFactory, type RepoWriter } from './repo-rw';
import { RebuildTriggerService, SignalScanService } from './scan';
import { latestAnalysesByPackage } from './scan/latest-analyses';
import { SeedTransferService } from './seed-transfer.service';
import {
  BASE_SYSTEM_SONAMES,
  buildDependencyGraph,
  compareArchVersions,
  decodeOwnerKey,
  type DependencyEdge,
  type DependencyNode,
  latestAnalysisByKey,
  pkgTypeOf,
} from './signal';

@Injectable()
export class RepoManagerService implements OnModuleInit {
  private readonly logger = new Logger(RepoManagerService.name);

  private repoManager!: RepoManager;
  private repos!: Repo[];
  private tasks: CronJob[] = [];
  private workDirs: { dir: string; busy: boolean }[] = [];

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
    private readonly pino: PinoLogger,
    @InjectRepository(ArchlinuxPackage)
    private archlinuxPackageRepository: Repository<ArchlinuxPackage>,
    @InjectRepository(Repo)
    private repoRepository: Repository<Repo>,
    @InjectRepository(Package)
    private packageRepository: Repository<Package>,
    @InjectRepository(PackageBump)
    private packageBumpRepository: Repository<PackageBump>,
    @InjectRepository(PackageElfAnalysis)
    private elfAnalysisRepository: Repository<PackageElfAnalysis>,
    private signalScanService: SignalScanService,
    private seedTransferService: SeedTransferService,
    private archMirrorService: ArchMirrorService,
    private chaoticIndexService: ChaoticIndexService,
    private rebuildTriggerService: RebuildTriggerService,
    private bumpService: BumpService,
    @Inject(REPO_WRITER) private repoWriter: RepoWriter,
    @Inject(REPO_READER_FACTORY) private readerFactory: RepoReaderFactory,
  ) {}

  onModuleInit(): void {
    void this.init().catch((err: unknown) => {
      this.logger.error(`RepoManager init failed: ${errorMessage(err)}`);
    });
  }

  async init(): Promise<void> {
    this.repos = await this.repoRepository.find({
      where: { isActive: true, repoUrl: Not(IsNull()) },
    });

    const runWithThis = this.run.bind(this);
    this.tasks.push(
      CronJob.from({
        cronTime: this.configService.getOrThrow<string>('repoMan.schedulerInterval'),
        onTick: runWithThis,
        start: true,
        timeZone: 'Europe/Berlin',
      }),
    );

    // The Arch mirror also serves as the build mirror. Poll its `lastupdate`
    // file so we notice repo re-syncs near-instantly (default every minute).
    const pollWithThis = this.pollMirrorLastUpdate.bind(this);
    this.tasks.push(
      CronJob.from({
        cronTime: this.configService.getOrThrow<string>('repoMan.mirrorPollInterval'),
        onTick: pollWithThis,
        start: true,
        timeZone: 'Europe/Berlin',
      }),
    );

    // We explicitly want to encrypt API tokens if they are prefixed with "CLEAR:"
    try {
      const reposWithTokens = await this.repoRepository.find({
        where: { apiToken: Not(IsNull()) },
      });
      const dbKey = this.configService.getOrThrow('app.dbKey');
      for (const repo of reposWithTokens) {
        if (repo.apiToken.startsWith('CLEAR:')) {
          const token = repo.apiToken.slice('CLEAR:'.length);
          repo.apiToken = encryptAes(token, dbKey);
          await this.repoRepository.save(repo);
        }
      }
    } catch (err: unknown) {
      this.logger.error(errorMessage(err));
    }

    this.repoManager = this.createRepoManager();
    this.logger.log(`RepoManager service initialized with ${this.repos.length} repos`);
  }

  async updateChaoticVersions(): Promise<void> {
    this.repos = await this.repoRepository.find({
      where: { isActive: true, dbPath: Not(IsNull()) },
    });
    await this.repoManager.updateChaoticDatabaseVersions(this.repos);
  }

  private lastMirrorUpdate: string | null = null;

  async pollMirrorLastUpdate(): Promise<void> {
    if (this.repoManager.status === RepoStatus.ACTIVE) {
      this.logger.debug('RepoManager is active, skipping mirror poll run');
      return;
    }

    const mirrorUrl = this.configService.get<string>('repoMan.mirrorUrl') ?? 'https://arch.mirror.constant.com';
    try {
      const response = await this.httpService.axiosRef({
        url: `${mirrorUrl}/lastupdate`,
        method: 'GET',
        responseType: 'text',
      });
      const lastUpdate: string = String(response.data).trim();

      if (this.lastMirrorUpdate !== null && lastUpdate !== this.lastMirrorUpdate) {
        this.logger.log(`Mirror re-synced (${this.lastMirrorUpdate} -> ${lastUpdate}), triggering run`);
        await this.run();
      } else if (this.lastMirrorUpdate === null) {
        this.logger.debug(`Initial mirror lastupdate recorded: ${lastUpdate}`);
      }
      this.lastMirrorUpdate = lastUpdate;
    } catch (err: unknown) {
      this.logger.warn(`Failed to poll mirror lastupdate: ${errorMessage(err)}`);
    }
  }

  async triggerSignalScan(): Promise<void> {
    await this.repoManager.pullArchlinuxPackages();
    await this.repoManager.scanChangedArchPackages();
  }

  async exportSignalsSeed(): Promise<PackageElfAnalysis[]> {
    return this.seedTransferService.exportSeed();
  }

  async indexArchMirror(): Promise<IndexResult> {
    return this.repoManager.indexArchMirror();
  }

  async indexChaoticRepo(dbUrl: string): Promise<IndexResult> {
    return this.repoManager.indexChaoticRepo(dbUrl);
  }

  async getBrokenPackages(): Promise<BrokenPackageReport[]> {
    // Arch packages are reference data and never judged broken, so only Chaotic
    // analyses are queried (and reported).
    const analyses = await this.elfAnalysisRepository.find({
      where: { broken: true, pkgType: pkgTypeOf(TriggerType.CHAOTIC) },
      order: { pkgId: 'ASC' },
    });
    if (analyses.length === 0) return [];

    const chaoticIds = analyses.map((a) => a.pkgId);
    const chaoticPkgs = await this.packageRepository.find({
      where: { id: In(chaoticIds) },
      relations: { repo: true },
    });
    const chaoticById = new Map(chaoticPkgs.map((p) => [p.id, p]));

    return analyses.map((analysis) => {
      const pkg = chaoticById.get(analysis.pkgId);
      return {
        pkgType: 'chaotic' as const,
        pkgname: pkg?.pkgname ?? String(analysis.pkgId),
        version: analysis.version,
        repoName: pkg?.repo?.name,
        reasons: analysis.brokenReasons,
      };
    });
  }

  async getDependencyGraph(): Promise<DependencyEdge[]> {
    // Select only the columns the graph needs; the full rows carry large jsonb
    // payloads (files/exportedSymbols/vtables) that would otherwise be loaded
    // for every analysis on every call.
    const analyses = await this.elfAnalysisRepository.find({
      select: {
        pkgType: true,
        pkgId: true,
        version: true,
        providedSonames: true,
        neededSonames: true,
      },
    });
    if (analyses.length === 0) return [];

    const archIds = analyses.filter((a) => a.pkgType === pkgTypeOf(TriggerType.ARCH)).map((a) => a.pkgId);
    const chaoticIds = analyses.filter((a) => a.pkgType === pkgTypeOf(TriggerType.CHAOTIC)).map((a) => a.pkgId);
    const [archPkgs, chaoticPkgs] = await Promise.all([
      archIds.length
        ? this.archlinuxPackageRepository.findBy({ id: In(archIds) })
        : Promise.resolve([] as ArchlinuxPackage[]),
      chaoticIds.length
        ? this.packageRepository.find({ where: { id: In(chaoticIds) } })
        : Promise.resolve([] as Package[]),
    ]);
    const nameById = new Map<`${string}:${number}`, string>();
    for (const pkg of archPkgs) nameById.set(`0:${pkg.id}`, pkg.pkgname);
    for (const pkg of chaoticPkgs) nameById.set(`1:${pkg.id}`, pkg.pkgname);

    // Keep only the latest analysis per package.
    const latest = latestAnalysisByKey(analyses, (a) => `${a.pkgType}:${a.pkgId}`);

    const nodes: DependencyNode[] = [...latest.values()].map((analysis) => ({
      pkgType: analysis.pkgType,
      pkgId: analysis.pkgId,
      pkgname: nameById.get(`${analysis.pkgType}:${analysis.pkgId}`) ?? String(analysis.pkgId),
      providedSonames: analysis.providedSonames,
      neededSonames: analysis.neededSonames,
    }));

    return buildDependencyGraph(nodes);
  }

  /**
   * What can cause a package to be rebuilt, per trigger channel. Explicit
   * triggers are read live from `.CI/config`; the rest come from persisted data
   * (metadata deps, the latest ELF analysis, the soname/plugin provider index).
   */
  async getRebuildTriggerSources(pkgname: string): Promise<PackageRebuildTriggerSources> {
    const pkg = await this.packageRepository.findOne({
      where: { pkgname, isActive: true },
      relations: { repo: true },
      order: { lastUpdated: 'DESC' },
    });
    if (!pkg) {
      throw new NotFoundException(`Package not found: ${pkgname}`);
    }

    const analyses = await this.elfAnalysisRepository.find({
      where: { pkgType: pkgTypeOf(TriggerType.CHAOTIC), pkgId: pkg.id },
    });
    // Latest by Arch version order, not DB string order (2:13 vs 2:9, 1.10 vs 1.9).
    const analysis = analyses.reduce<PackageElfAnalysis | undefined>((latest, candidate) => {
      if (!latest || compareArchVersions(candidate.version, latest.version) > 0) return candidate;
      return latest;
    }, undefined);

    const explicitTriggers = await this.explicitTriggersFor(pkg);

    // Only packages the package actually depends on can trigger its rebuild:
    // a soname provider or plugin owner that isn't in metadata.deps cannot be
    // the cause of a BROKEN_DEPS/PLUGIN bump. When no deps are recorded (e.g.
    // test seeds) the filter is a no-op and all providers are returned.
    const deps = new Set(pkg.metadata?.deps ?? []);

    const sonameDependencies = analysis ? await this.sonameDependenciesFor(analysis.neededSonames, deps) : [];
    const pluginOwners = analysis ? await this.pluginOwnersFor(analysis.pluginOf, pkg.id, deps) : [];

    return { pkgname, explicitTriggers, sonameDependencies, pluginOwners };
  }

  private async explicitTriggersFor(pkg: Package): Promise<{ pkgname: string; archVersion: string }[]> {
    const configuredNames = await this.readConfiguredRebuildTriggers(pkg);
    if (configuredNames.length === 0) {
      return (pkg.bumpTriggers ?? []).map((trigger) => ({
        pkgname: trigger.pkgname,
        archVersion: trigger.archVersion,
      }));
    }

    const archPkgs = await this.archlinuxPackageRepository.find({
      where: { pkgname: In(configuredNames) },
    });
    const versionByName = new Map(archPkgs.map((archPkg) => [archPkg.pkgname, archPkg.version]));
    return configuredNames.map((name) => ({
      pkgname: name,
      archVersion: versionByName.get(name) ?? '',
    }));
  }

  private async readConfiguredRebuildTriggers(pkg: Package): Promise<string[]> {
    if (!pkg.repo) return [];
    let reader: RepoReader;
    try {
      reader = await this.readerFactory.open(pkg.repo);
    } catch (err: unknown) {
      this.logger.warn(`Cannot open repo ${pkg.repo.name} for ${pkg.pkgname} rebuild triggers: ${errorMessage(err)}`);
      return [];
    }

    try {
      const configText = await reader.readFile(`${pkg.pkgname}/.CI/config`);
      const configs = parseCiConfig(configText);
      return configs['CI_REBUILD_TRIGGERS']?.split(':').filter(Boolean) ?? [];
    } finally {
      await reader.dispose();
    }
  }

  private async sonameDependenciesFor(neededSonames: string[], deps: ReadonlySet<string>): Promise<SonameDependency[]> {
    const needed = neededSonames.filter((soname) => !BASE_SYSTEM_SONAMES.has(soname));
    if (needed.length === 0) return [];

    const latest = await latestAnalysesByPackage(this.elfAnalysisRepository);
    const archRows = [...latest.values()].filter((row) => row.pkgType === pkgTypeOf(TriggerType.ARCH));
    if (archRows.length === 0) return [];

    const providerIds = new Set<string>();
    const providersBySoname = new Map<string, string[]>();
    for (const row of archRows) {
      const key = `${row.pkgType}:${row.pkgId}`;
      for (const soname of row.providedSonames) {
        const list = providersBySoname.get(soname) ?? [];
        list.push(key);
        providersBySoname.set(soname, list);
        providerIds.add(key);
      }
    }

    const nameByKey = await this.resolveAnalysisNames([...providerIds]);

    return needed
      .map((soname) => ({
        soname,
        providers: (providersBySoname.get(soname) ?? [])
          .map((key) => nameByKey.get(key))
          .filter(
            (provider): provider is RebuildTriggerSourcePackage =>
              provider !== undefined && (deps.size === 0 || deps.has(provider.pkgname)),
          ),
      }))
      .filter((dependency) => dependency.providers.length > 0);
  }

  private async resolveAnalysisNames(keys: string[]): Promise<Map<string, RebuildTriggerSourcePackage>> {
    const archIds: number[] = [];
    const chaoticIds: number[] = [];
    for (const key of keys) {
      const [type, idStr] = key.split(':');
      const id = Number(idStr);
      if (idStr === undefined || idStr === '' || !Number.isInteger(id)) {
        this.logger.warn(`Skipping malformed analysis key: "${key}"`);
        continue;
      }
      if (type === pkgTypeOf(TriggerType.ARCH)) archIds.push(id);
      else chaoticIds.push(id);
    }

    const [archPkgs, chaoticPkgs] = await Promise.all([
      archIds.length
        ? this.archlinuxPackageRepository.findBy({ id: In(archIds) })
        : Promise.resolve([] as ArchlinuxPackage[]),
      chaoticIds.length
        ? this.packageRepository.find({ where: { id: In(chaoticIds) } })
        : Promise.resolve([] as Package[]),
    ]);

    const nameByKey = new Map<string, RebuildTriggerSourcePackage>();
    for (const pkg of archPkgs) {
      nameByKey.set(`${pkgTypeOf(TriggerType.ARCH)}:${pkg.id}`, { pkgname: pkg.pkgname, pkgType: 'arch' });
    }
    for (const pkg of chaoticPkgs) {
      nameByKey.set(`${pkgTypeOf(TriggerType.CHAOTIC)}:${pkg.id}`, { pkgname: pkg.pkgname, pkgType: 'chaotic' });
    }
    return nameByKey;
  }

  private async pluginOwnersFor(
    ownerKeys: string[],
    selfPkgId: number,
    deps: ReadonlySet<string>,
  ): Promise<RebuildTriggerSourcePackage[]> {
    const archIds: number[] = [];
    const chaoticIds: number[] = [];
    for (const key of ownerKeys) {
      const decoded = decodeOwnerKey(key);
      if (!decoded) continue;
      if (decoded.pkgType === TriggerType.CHAOTIC && decoded.pkgId === selfPkgId) continue;
      if (decoded.pkgType === TriggerType.ARCH) archIds.push(decoded.pkgId);
      else chaoticIds.push(decoded.pkgId);
    }

    if (archIds.length === 0 && chaoticIds.length === 0) return [];

    const [archPkgs, chaoticPkgs] = await Promise.all([
      archIds.length
        ? this.archlinuxPackageRepository.findBy({ id: In(archIds) })
        : Promise.resolve([] as ArchlinuxPackage[]),
      chaoticIds.length
        ? this.packageRepository.find({ where: { id: In(chaoticIds) } })
        : Promise.resolve([] as Package[]),
    ]);

    const isDependency = (pkgname: string): boolean => deps.size === 0 || deps.has(pkgname);
    return [
      ...archPkgs
        .filter((pkg) => isDependency(pkg.pkgname))
        .map((pkg) => ({ pkgname: pkg.pkgname, pkgType: 'arch' as const })),
      ...chaoticPkgs
        .filter((pkg) => isDependency(pkg.pkgname))
        .map((pkg) => ({ pkgname: pkg.pkgname, pkgType: 'chaotic' as const })),
    ];
  }

  async importSignalsSeed(seed: unknown[]): Promise<void> {
    await this.seedTransferService.importSeed(seed);
  }

  async importSignalsSeedFile(path: string): Promise<void> {
    await this.seedTransferService.importSeedFile(path);
  }

  async run(): Promise<void> {
    const runId = randomUUID();
    const run = { runId, component: 'repoManager' };

    if (this.repoManager.status === RepoStatus.ACTIVE) {
      this.pino.warn(run, 'RepoManager is already active, skipping run');
      return;
    }

    await this.repoManager.pullArchlinuxPackages();

    if (this.repoManager.changedArchPackages.length === 0) {
      this.pino.info(run, 'No packages changed in Arch repos, skipping run');
      return;
    }

    // When the signal scanner is enabled, download the changed packages from
    // the mirror and scan them before computing rebuild triggers.
    if (this.configService.get<boolean>('repoMan.signalScanEnabled')) {
      await this.repoManager.scanChangedArchPackages();
    }

    const results: BumpResult[] = [];
    for (const repo of this.repos) {
      const result: BumpResult = await this.repoManager.startRun(repo);
      results.push(result);
    }

    this.summarizeChanges(results, this.repoManager);
  }

  createRepoManager(): RepoManager {
    const repoSettings: RepoSettings = {
      regenDatabase: this.configService.getOrThrow('repoMan.regenDatabase'),
      abiDryRun: this.configService.get<boolean>('repoMan.abiDryRun') ?? true,
      mirrorUrl: this.configService.get<string>('repoMan.mirrorUrl'),
      signalScanEnabled: this.configService.get<boolean>('repoMan.signalScanEnabled') ?? false,
    };

    return new RepoManager(
      repoSettings,
      this.httpService,
      this.readerFactory,
      this.signalScanService,
      this.packageRepository,
      this.archMirrorService,
      this.chaoticIndexService,
      this.rebuildTriggerService,
      this.bumpService,
    );
  }

  summarizeChanges(results: BumpResult[], repoManager: RepoManager): void {
    if (results.some((result) => result.origin === TriggerType.ARCH) && repoManager.changedArchPackages) {
      this.logger.log(
        `Run was triggered by Arch package updates, ${repoManager.changedArchPackages.length} Arch package(s) were changed`,
        'RepoManager',
      );
    } else if (results.some((result) => result.origin === TriggerType.CHAOTIC)) {
      this.logger.log('Run was triggered by a Chaotic-AUR package update');
    }

    for (const result of results) {
      if (!result.bumped || result.bumped.length === 0) {
        this.logger.log(`No packages affected in ${result.repo}`);
        continue;
      }
      if (result.repo) {
        this.logger.log(`Bumped package(s) in ${result.repo}:`);
        for (const res of result.bumped) {
          const bumpType: string = bumpTypeToText(res.bumpType);
          const bumpDetails: string = res.details?.length ? ` (${res.details.join(', ')})` : '';
          this.logger.log(` - ${res.pkg.pkgname} bumped ${bumpType} (${res.triggerName})${bumpDetails}`);
        }
      }
    }
  }

  async eventuallyBumpAffected(build: Partial<Build>) {
    const result: BumpResult[] = [await this.repoManager.checkPackageDepsAfterDeployment(build)];
    if (result.length > 0) {
      this.summarizeChanges(result, this.repoManager);
    }
  }

  async getBumpLogs(options: { amount: number; skip: number }): Promise<BumpLogEntry[]> {
    const amount = options.amount || 100;
    const skip = options.skip || 0;

    const logEntries: PackageBump[] = await this.packageBumpRepository.find({
      take: amount,
      skip,
      relations: {
        pkg: true,
      },
    });
    if (logEntries.length === 0) return [];

    // Resolve every trigger name in two batched queries (one per trigger type)
    // instead of one findOne per bump entry.
    const archIds = [...new Set(logEntries.filter((e) => e.triggerFrom === TriggerType.ARCH).map((e) => e.trigger))];
    const chaoticIds = [
      ...new Set(logEntries.filter((e) => e.triggerFrom === TriggerType.CHAOTIC).map((e) => e.trigger)),
    ];
    const [archTriggers, chaoticTriggers] = await Promise.all([
      archIds.length
        ? this.archlinuxPackageRepository.findBy({ id: In(archIds) })
        : Promise.resolve([] as ArchlinuxPackage[]),
      chaoticIds.length ? this.packageRepository.findBy({ id: In(chaoticIds) }) : Promise.resolve([] as Package[]),
    ]);
    const archNameById = new Map(archTriggers.map((p) => [p.id, p.pkgname]));
    const chaoticNameById = new Map(chaoticTriggers.map((p) => [p.id, p.pkgname]));

    return logEntries.map((logEntry) => {
      const trigger =
        logEntry.triggerFrom === TriggerType.ARCH
          ? archNameById.get(logEntry.trigger)
          : chaoticNameById.get(logEntry.trigger);
      return {
        bumpType: logEntry.bumpType,
        timestamp: logEntry.timestamp.toISOString(),
        triggerFrom: logEntry.triggerFrom,
        pkgname: logEntry.pkg.pkgname,
        trigger: trigger ?? String(logEntry.trigger),
        details: logEntry.details,
      };
    });
  }
}
