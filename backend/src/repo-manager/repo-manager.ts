import { RepoStatus } from '@chaotic-next/shared-lib';
import { HttpService } from '@nestjs/axios';
import { Logger } from '@nestjs/common';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Repository } from 'typeorm';
import { Build, Package, Repo } from '../builder/builder.entity';
import {
  BumpResult,
  BumpType,
  IndexResult,
  PackageBumpEntry,
  PackageConfig,
  RepoSettings,
  RepoUpdateRunParams,
  TriggerType,
} from '../interfaces/repo-manager';
import { errorMessage } from '../utils/functions';
import { ArchMirrorService } from './arch-mirror.service';
import { BumpService, isCiFlagEnabled } from './bump';
import { ChaoticIndexService } from './chaotic-index.service';
import { ArchlinuxPackage } from './repo-manager.entity';
import { type RepoReader, type RepoReaderFactory } from './repo-rw';
import { CI_FLAG_REBUILD_IGNORE_ABI, RebuildTriggerService, SignalScanService } from './scan';
import { formatConsumerAbiBreak } from './signal';

export class RepoManager {
  private readonly logger = new Logger(RepoManager.name);

  changedArchPackages: ArchlinuxPackage[] = [];
  status: RepoStatus = RepoStatus.INACTIVE;
  deployInProgress: RepoStatus = RepoStatus.INACTIVE;

  constructor(
    private readonly settings: RepoSettings,
    private readonly httpService: HttpService,
    private readonly readerFactory: RepoReaderFactory,
    private readonly signalScanService: SignalScanService,
    private readonly packagesRepository: Repository<Package>,
    private readonly archMirror: ArchMirrorService,
    private readonly chaoticIndex: ChaoticIndexService,
    private readonly triggers: RebuildTriggerService,
    private readonly bump: BumpService,
  ) {
    this.logger.log('RepoManager initialized');
  }

  /**
   * Read a repository via the GitLab API and check its packages for rebuild triggers.
   * @param repo The repository to scan
   * @returns An object containing the bumped packages and the repository name
   */
  async startRun(repo: Repo): Promise<BumpResult> {
    this.logger.log(`Checking repo ${repo.name} for rebuild triggers...`);

    if (this.status === RepoStatus.ACTIVE) {
      this.logger.warn('RepoManager is already active, skipping run');
      return { repo: repo.name, bumped: [], origin: TriggerType.ARCH };
    }
    if (!repo.gitlabProjectId) {
      this.logger.warn(`Repo ${repo.name} has no gitlabProjectId, skipping rebuild check`);
      return { repo: repo.name, bumped: [], origin: TriggerType.ARCH };
    }
    this.status = RepoStatus.ACTIVE;

    let reader: RepoReader | undefined;
    try {
      reader = await this.readerFactory.open(repo);
      const pkgbaseDirs: string[] = await reader.listPackageDirs();
      const needsRebuild: RepoUpdateRunParams[] = await this.triggers.checkRebuildTriggers(
        reader,
        pkgbaseDirs,
        repo,
        this.changedArchPackages,
        this.settings,
      );

      if (!needsRebuild || needsRebuild.length === 0) {
        return { repo: repo.name, bumped: [], origin: TriggerType.ARCH };
      }
      const bumpedPackages: PackageBumpEntry[] = await this.bump.bumpPackages(needsRebuild, reader);
      const needsPush = needsRebuild.filter((entry) => entry.gotBumped === true);

      this.logger.log(`Pushing changes to ${repo.name}`);
      await this.bump.pushChanges(needsPush, repo);

      return {
        repo: repo.name,
        bumped: bumpedPackages,
        origin: TriggerType.ARCH,
      };
    } finally {
      this.status = RepoStatus.INACTIVE;
      await reader?.dispose();
    }
  }

  async pullArchlinuxPackages(): Promise<void> {
    this.changedArchPackages = await this.archMirror.pullChangedArchPackages(this.settings);
  }

  async scanChangedArchPackages(): Promise<void> {
    await this.archMirror.scanChangedArchPackages(this.changedArchPackages, this.settings);
  }

  async indexArchMirror(): Promise<IndexResult> {
    if (this.status === RepoStatus.ACTIVE) {
      this.logger.warn('RepoManager is already active, skipping full Arch mirror index');
      return { scanned: 0, skipped: 0, failed: 0 };
    }
    this.status = RepoStatus.ACTIVE;
    try {
      return await this.archMirror.indexArchMirror(this.settings);
    } finally {
      this.status = RepoStatus.INACTIVE;
    }
  }

  async indexChaoticRepo(dbUrl: string): Promise<IndexResult> {
    if (this.deployInProgress === RepoStatus.ACTIVE) {
      this.logger.warn('Deployment is already in progress, skipping Chaotic repo index');
      return { scanned: 0, skipped: 0, failed: 0 };
    }
    this.deployInProgress = RepoStatus.ACTIVE;
    try {
      return await this.chaoticIndex.indexChaoticRepo(dbUrl);
    } finally {
      this.deployInProgress = RepoStatus.INACTIVE;
    }
  }

  async updateChaoticDatabaseVersions(repos: Repo[]): Promise<void> {
    await this.chaoticIndex.updateChaoticDatabaseVersions(repos);
  }

  private async scanBuiltChaoticPackage(build: Partial<Build>): Promise<void> {
    const pkg: Package | undefined = build.pkgbase;
    if (!pkg) return;
    if (pkg.skipSignalScan) {
      this.logger.log(`Skipping scan of ${pkg.pkgname}: marked binary-only (skip signal scan)`);
      return;
    }
    const filename: string | undefined = pkg.metadata?.filename;
    if (!filename) {
      this.logger.warn(`No filename for built package ${pkg.pkgname}, skipping scan`);
      return;
    }

    const dbPath: string | undefined = build.repo?.dbPath;
    if (!dbPath) {
      this.logger.warn(`No dbPath for repo ${build.repo?.name}, skipping scan of ${pkg.pkgname}`);
      return;
    }

    const repoUrl: string = dbPath.replace(/\/[^/]+$/, '');
    const tempDir: string = await mkdtemp(join(tmpdir(), 'chaotic-signal-'));
    const downloadPath: string = join(tempDir, filename);

    try {
      const response = await this.httpService.axiosRef({
        url: `${repoUrl}/${filename}`,
        method: 'GET',
        responseType: 'arraybuffer',
      });
      await writeFile(downloadPath, Buffer.from(response.data, 'binary'));

      this.logger.log(`Scanning built package ${pkg.pkgname} (${pkg.version}) for ELF signals`);
      await this.signalScanService.scanPackages([
        {
          file: downloadPath,
          pkgType: TriggerType.CHAOTIC,
          pkgId: pkg.id,
          version: pkg.version,
        },
      ]);
    } catch (err: unknown) {
      this.logger.warn(`Failed to download/scan ${filename}: ${errorMessage(err)}`);
    } finally {
      await this.archMirror.cleanUp([tempDir]);
    }
  }

  async checkPackageDepsAfterDeployment(build: Partial<Build>): Promise<BumpResult> {
    if (this.deployInProgress === RepoStatus.ACTIVE) {
      this.logger.warn('Deployment is already in progress, skipping');
      return { repo: build.repo?.name ?? '', bumped: [], origin: TriggerType.CHAOTIC };
    }
    this.deployInProgress = RepoStatus.ACTIVE;

    const repo = build.repo;
    const pkgbase = build.pkgbase;
    if (!repo || !pkgbase) {
      this.deployInProgress = RepoStatus.INACTIVE;
      return { repo: repo?.name ?? '', bumped: [], origin: TriggerType.CHAOTIC };
    }

    try {
      if (this.settings.signalScanEnabled) {
        await this.scanBuiltChaoticPackage(build);
      }

      const allPackages: Package[] = await this.packagesRepository.find({
        where: { isActive: true },
      });
      const needsRebuild: RepoUpdateRunParams[] = [];
      const reader = await this.readerFactory.open(repo);
      let bumped: PackageBumpEntry[] = [];
      try {
        // Pre-resolved package rows are passed straight into readPackageConfig so
        // it skips a getOrCreatePackage() round-trip per package, and each config is
        // read at most once (memoized) instead of twice when signal scan is on.
        const configPromises = new Map<string, Promise<PackageConfig>>();
        const readConfig = (pkg: Package): Promise<PackageConfig> => {
          let p = configPromises.get(pkg.pkgname);
          if (!p) {
            p = this.bump.readPackageConfig(reader, {
              pkgbaseDir: pkg.pkgname,
              repo,
              pkgInDb: pkg,
            });
            configPromises.set(pkg.pkgname, p);
          }
          return p;
        };

        for (const pkg of allPackages) {
          const configs: PackageConfig = await readConfig(pkg);

          if (pkg.bumpTriggers) {
            if (pkg.bumpTriggers.find((trigger) => trigger.pkgname === pkgbase.pkgname)) {
              needsRebuild.push({
                configs: configs.configs,
                pkg,
                archPkg: pkgbase,
                bumpType: BumpType.EXPLICIT,
                triggerFrom: TriggerType.CHAOTIC,
              });
              this.logger.debug(`Rebuilding ${pkg.pkgname} because of explicit trigger ${pkgbase.pkgname}`);
            }
          }
        }

        // Rebuild dependents of the just-deployed Chaotic package whose ELF
        // signal changed incompatibly: the owner lost symbols or a vtable slot
        // drifted, and a dependent imports a shifted slot. This is the same ABI
        // signal as the arch->chaotic plugin channel, applied to chaotic->chaotic.
        if (this.settings.signalScanEnabled) {
          const ownerIndex = await this.triggers.buildDeployedOwnerBreakIndex(pkgbase);
          if (ownerIndex) {
            const consumerAnalyses = await this.triggers.loadLatestChaoticAnalyses(
              allPackages.filter((p) => p.id !== pkgbase.id).map((p) => p.id),
            );
            for (const pkg of allPackages) {
              if (pkg.id === pkgbase.id) continue;
              const configs: PackageConfig = await readConfig(pkg);
              if (pkg.skipSignalScan || isCiFlagEnabled(configs.configs, CI_FLAG_REBUILD_IGNORE_ABI)) continue;
              const consumerAnalysis = consumerAnalyses.get(pkg.id);
              const breaks = consumerAnalysis
                ? this.triggers.consumerSymbolBreaksFor(consumerAnalysis, ownerIndex)
                : [];
              const trigger = breaks[0];
              if (!trigger) continue;
              this.triggers.recordRebuildTrigger({
                needsRebuild,
                pkgConfig: configs,
                archPkg: pkgbase,
                bumpType: BumpType.PLUGIN,
                reason: `plugin ABI break of ${trigger.pkgname}`,
                details: breaks.map(formatConsumerAbiBreak),
                pkgbaseDir: pkg.pkgname,
                settings: this.settings,
                triggerFrom: TriggerType.CHAOTIC,
              });
            }
          }
        }

        bumped = await this.bump.bumpPackages(needsRebuild, reader);
        const needsPush = needsRebuild.filter((entry) => entry.gotBumped === true);

        if (bumped.length > 0) {
          await this.bump.pushChanges(needsPush, repo);
        }
      } finally {
        await reader.dispose();
      }

      return {
        repo: repo.name,
        bumped: bumped,
        origin: TriggerType.CHAOTIC,
      };
    } catch (err: unknown) {
      this.logger.error(err instanceof Error ? errorMessage(err) : String(err));
      return { repo: repo.name, bumped: [], origin: TriggerType.CHAOTIC };
    } finally {
      this.deployInProgress = RepoStatus.INACTIVE;
    }
  }
}
