import { requiredGroupForRepo } from '../auth/gitlab-groups';
import { Build, Package, Repo } from '../builder/builder.entity';
import {
  BrokenPackageReport,
  BumpResult,
  BumpType,
  IndexResult,
  PackageRebuildTriggerSources,
  RebuildTriggerSourcePackage,
  RepoSettings,
  RepoUpdateRunParams,
  SonameDependency,
  TriggerType,
} from '../interfaces/repo-manager';
import { bumpTypeToText, errorMessage } from '../utils/functions';
import { paginate, resolvePagination } from '../utils/pagination';
import { ArchMirrorService } from './arch-mirror.service';
import { BumpService, parseCiConfig } from './bump';
import { ChaoticIndexService } from './chaotic-index.service';
import { RepoManager } from './repo-manager';
import { ArchlinuxPackage, PackageElfAnalysis } from './repo-manager.entity';
import { REPO_READER_FACTORY, REPO_WRITER, type RepoReader, type RepoReaderFactory, type RepoWriter } from './repo-rw';
import { RebuildTriggerService, SignalScanService } from './scan';
import { latestAnalysesByPackage } from './scan/latest-analyses';
import {
  ARCH_PKG_TYPE,
  BASE_SYSTEM_SONAMES,
  buildDependencyGraph,
  CHAOTIC_PKG_TYPE,
  compareArchVersions,
  decodeOwnerKey,
  latestAnalysisByKey,
  pkgTypeOf,
  type DependencyEdge,
  type DependencyNode,
} from './signal';
import { Paginated, RepoStatus, type BumpPackagesResult } from '@chaotic-next/shared-lib';
import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { CronJob } from 'cron';
import { PinoLogger } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { In, IsNull, Not, Repository } from 'typeorm';

/** The cron scheduler runs on German time so runs align with Arch mirror syncs. */
const CRON_TIME_ZONE = 'Europe/Berlin';

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
    @InjectRepository(PackageElfAnalysis)
    private elfAnalysisRepository: Repository<PackageElfAnalysis>,
    private signalScanService: SignalScanService,
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
        timeZone: CRON_TIME_ZONE,
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
        timeZone: CRON_TIME_ZONE,
      }),
    );

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

  async indexArchMirror(): Promise<IndexResult> {
    return this.repoManager.indexArchMirror();
  }

  async indexChaoticRepo(): Promise<IndexResult> {
    return this.repoManager.indexChaoticRepo();
  }

  async getBrokenPackages(page?: number, perPage?: number): Promise<Paginated<BrokenPackageReport>> {
    const { page: safePage, perPage: safePerPage, skip } = resolvePagination(page, perPage);
    const allChaotic = await this.elfAnalysisRepository.find({
      where: { pkgType: pkgTypeOf(TriggerType.CHAOTIC) },
      select: { pkgId: true, version: true, broken: true, brokenReasons: true },
    });
    const latest = latestAnalysisByKey(allChaotic, (row) => String(row.pkgId));
    const brokenAnalyses = [...latest.values()].filter((a) => a.broken);
    if (brokenAnalyses.length === 0) return paginate([], 0, safePage, safePerPage);

    const chaoticIds = [...new Set(brokenAnalyses.map((a) => a.pkgId))];
    const chaoticPkgs = await this.packageRepository.find({
      where: { id: In(chaoticIds) },
      relations: { repo: true },
    });
    const chaoticById = new Map(chaoticPkgs.map((p) => [p.id, p]));

    const allBrokenReports: BrokenPackageReport[] = brokenAnalyses
      .map((analysis) => {
        const pkg = chaoticById.get(analysis.pkgId);
        return {
          pkgType: 'chaotic' as const,
          pkgname: pkg?.pkgname ?? String(analysis.pkgId),
          version: analysis.version,
          repoName: pkg?.repo?.name,
          reasons: analysis.brokenReasons,
          skipSignalScan: pkg?.skipSignalScan ?? false,
        };
      })
      .filter((report) => !report.skipSignalScan);

    const total = allBrokenReports.length;
    allBrokenReports.sort((a, b) => a.pkgname.localeCompare(b.pkgname));
    const items = allBrokenReports.slice(skip, skip + safePerPage);
    return paginate(items, total, safePage, safePerPage);
  }

  /**
   * Manually bump a set of packages selected from the admin UI. Packages are
   * grouped by repo and each repo's `.CI/config` is rewritten in one atomic
   * GitLab commit. This is an explicit admin action, so it always bumps
   * regardless of the ABI dry-run setting.
   */
  async bumpSelectedPackages(pkgnames: string[], actorGroups: string[]): Promise<BumpPackagesResult> {
    const uniqueNames = [...new Set(pkgnames.map((name) => name.trim()).filter(Boolean))];
    if (uniqueNames.length === 0) {
      throw new BadRequestException('No packages provided', { errorCode: 'NO_PACKAGES' });
    }

    const pkgs = await this.packageRepository.find({
      where: { pkgname: In(uniqueNames), isActive: true },
      relations: { repo: true },
    });
    const byRepo = new Map<number, Package[]>();
    for (const pkg of pkgs) {
      if (!pkg.repo) continue;
      const list = byRepo.get(pkg.repo.id) ?? [];
      list.push(pkg);
      byRepo.set(pkg.repo.id, list);
    }
    if (byRepo.size === 0) {
      throw new NotFoundException('No active packages matched the selection');
    }

    for (const repoPkgs of byRepo.values()) {
      const repoName = repoPkgs[0]?.repo?.name;
      if (!repoName) continue;
      const requiredGroup = requiredGroupForRepo(repoName);
      if (requiredGroup && !actorGroups.includes(requiredGroup)) {
        throw new ForbiddenException(`Bumping '${repoName}' packages requires membership in '${requiredGroup}'`, {
          errorCode: 'MISSING_GROUP',
        });
      }
    }

    // The commit must carry the reason each package is broken (missing sonames),
    // not just that it was bumped manually.
    const brokenReasons = await this.loadBrokenReasons([...byRepo.values()].flat());
    const skipped: string[] = [];

    if (this.repoManager.status === RepoStatus.ACTIVE) {
      throw new ConflictException('Repo manager is already running, try again later', {
        errorCode: 'RUN_IN_PROGRESS',
      });
    }

    const bumped: string[] = [];
    for (const repoPkgs of byRepo.values()) {
      const repo = repoPkgs[0].repo;
      let reader: RepoReader | undefined;
      try {
        reader = await this.readerFactory.open(repo);
        // The `.CI/config` lives under the repo's pkgbase directory. A broken
        // report can name a built sub-package that is not a real directory, so
        // only bump packages whose directory actually exists in the repo.
        const dirs = new Set(await reader.listPackageDirs());
        const needsRebuild: RepoUpdateRunParams[] = [];
        for (const pkg of repoPkgs) {
          if (!dirs.has(pkg.pkgname)) {
            skipped.push(pkg.pkgname);
            continue;
          }
          const configText = await reader.readFile(`${pkg.pkgname}/.CI/config`).catch(() => '');
          const reasons = brokenReasons.get(pkg.id) ?? [];
          needsRebuild.push({
            archPkg: pkg,
            bumpType: BumpType.MANUAL,
            configs: parseCiConfig(configText),
            pkg,
            triggerFrom: TriggerType.CHAOTIC,
            details: reasons.length > 0 ? reasons : ['manual bump from admin UI'],
          });
        }
        if (needsRebuild.length === 0) continue;
        const bumpedEntries = await this.bumpService.bumpAndPush(needsRebuild, reader, repo);
        bumped.push(...bumpedEntries.map((entry) => entry.pkg.pkgname));
      } finally {
        await reader?.dispose();
      }
    }

    if (skipped.length > 0) {
      this.logger.warn(`Skipped ${skipped.length} package(s) without a repo directory: ${skipped.join(', ')}`);
    }
    return { bumped };
  }

  private async loadBrokenReasons(pkgs: Package[]): Promise<Map<number, string[]>> {
    if (pkgs.length === 0) return new Map();
    const rows = await this.elfAnalysisRepository.find({
      where: { pkgType: pkgTypeOf(TriggerType.CHAOTIC), pkgId: In(pkgs.map((p) => p.id)), broken: true },
      select: { pkgId: true, version: true, brokenReasons: true },
    });
    const latest = latestAnalysisByKey(rows, (row) => String(row.pkgId));
    return new Map([...latest.values()].map((row) => [row.pkgId, row.brokenReasons]));
  }

  /**
   * Fetch Arch and Chaotic package rows for the given analysis pkgIds in two
   * batched queries, one per namespace.
   */
  private async fetchPackagesByIds(
    archIds: number[],
    chaoticIds: number[],
  ): Promise<{ archPkgs: ArchlinuxPackage[]; chaoticPkgs: Package[] }> {
    const [archPkgs, chaoticPkgs] = await Promise.all([
      archIds.length ? this.archlinuxPackageRepository.findBy({ id: In(archIds) }) : Promise.resolve([]),
      chaoticIds.length ? this.packageRepository.findBy({ id: In(chaoticIds) }) : Promise.resolve([]),
    ]);
    return { archPkgs, chaoticPkgs };
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

    const archIds = analyses.filter((a) => a.pkgType === ARCH_PKG_TYPE).map((a) => a.pkgId);
    const chaoticIds = analyses.filter((a) => a.pkgType === CHAOTIC_PKG_TYPE).map((a) => a.pkgId);
    const { archPkgs, chaoticPkgs } = await this.fetchPackagesByIds(archIds, chaoticIds);
    const nameById = new Map<string, string>();
    for (const pkg of archPkgs) nameById.set(`${ARCH_PKG_TYPE}:${pkg.id}`, pkg.pkgname);
    for (const pkg of chaoticPkgs) nameById.set(`${CHAOTIC_PKG_TYPE}:${pkg.id}`, pkg.pkgname);

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
    const pkgs = await this.packageRepository.find({
      where: { pkgname, isActive: true },
      relations: { repo: true },
      order: { lastUpdated: 'DESC' },
    });
    if (pkgs.length === 0) {
      throw new NotFoundException(`Package not found: ${pkgname}`);
    }

    // A pkgname can map to several package rows (e.g. duplicate/renamed repo
    // entries), and only one of them carries the current ELF analysis. Look
    // across all of them and use the newest analysis; a lone findOne() can pick
    // a row with no analysis and wrongly report an empty dependency graph.
    const analyses = await this.elfAnalysisRepository.find({
      where: { pkgType: pkgTypeOf(TriggerType.CHAOTIC), pkgId: In(pkgs.map((pkg) => pkg.id)) },
    });
    // Latest by Arch version order, not DB string order (2:13 vs 2:9, 1.10 vs 1.9).
    const analysis = analyses.reduce<PackageElfAnalysis | undefined>((latest, candidate) => {
      if (!latest || compareArchVersions(candidate.version, latest.version) > 0) return candidate;
      return latest;
    }, undefined);

    // Base the report on the package that owns the analysis (for metadata deps
    // and explicit triggers); otherwise fall back to the most recently updated.
    const pkg = pkgs.find((candidate) => candidate.id === analysis?.pkgId) ?? pkgs[0];

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
      if (type === ARCH_PKG_TYPE) archIds.push(id);
      else chaoticIds.push(id);
    }

    const { archPkgs, chaoticPkgs } = await this.fetchPackagesByIds(archIds, chaoticIds);

    const nameByKey = new Map<string, RebuildTriggerSourcePackage>();
    for (const pkg of archPkgs) {
      nameByKey.set(`${ARCH_PKG_TYPE}:${pkg.id}`, { pkgname: pkg.pkgname, pkgType: 'arch' });
    }
    for (const pkg of chaoticPkgs) {
      nameByKey.set(`${CHAOTIC_PKG_TYPE}:${pkg.id}`, { pkgname: pkg.pkgname, pkgType: 'chaotic' });
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

    const { archPkgs, chaoticPkgs } = await this.fetchPackagesByIds(archIds, chaoticIds);

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

  async run(): Promise<void> {
    const runId = randomUUID();
    const run = { runId, component: 'repoManager' };

    if (this.repoManager.status === RepoStatus.ACTIVE) {
      this.pino.warn(run, 'RepoManager is already active, skipping run');
      return;
    }

    this.repoManager.status = RepoStatus.ACTIVE;
    try {
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
    } finally {
      this.repoManager.status = RepoStatus.INACTIVE;
    }
  }

  createRepoManager(): RepoManager {
    const repoSettings: RepoSettings = {
      regenDatabase: this.configService.getOrThrow('repoMan.regenDatabase'),
      abiDryRun: this.configService.get<boolean>('repoMan.abiDryRun') ?? true,
      mirrorUrl: this.configService.get<string>('repoMan.mirrorUrl'),
      signalScanEnabled: this.configService.get<boolean>('repoMan.signalScanEnabled') ?? false,
      secretMirrorUrl: this.configService.get<string>('app.secretMirrorUrl'),
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
}
