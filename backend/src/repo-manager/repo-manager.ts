import { RepoStatus } from '@chaotic-next/shared-lib';
import { HttpService } from '@nestjs/axios';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Repository } from 'typeorm';
import { Build, Package, Repo } from '../builder/builder.entity';
import type {
  BumpResult,
  IndexResult,
  PackageBumpEntry,
  PackageConfig,
  RepoSettings,
  RepoUpdateRunParams,
} from '../interfaces/repo-manager';
import { BumpType, TriggerType } from '../interfaces/repo-manager';
import { downloadWithRetry } from '../utils/download';
import { ArchMirrorService } from './arch-mirror.service';
import { BumpService } from './bump';
import { ChaoticIndexService } from './chaotic-index.service';
import { ArchlinuxPackage } from './repo-manager.entity';
import { type RepoReader, type RepoReaderFactory } from './repo-rw';
import { acceptsSignalRebuild, type DetectedTrigger, RebuildTriggerService, SignalScanService } from './scan';
import { groupByPkgbase, pkgbaseOf } from './scan/pkgbase-outputs';

// How long a pending Arch change waits for a successful scan of its current version.
export const UNSCANNED_CHANGE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function isUnscannedChangeExpired(pkg: ArchlinuxPackage, now: Date): boolean {
  if (pkg.lastUpdated === null) return true;

  return now.getTime() - pkg.lastUpdated.getTime() >= UNSCANNED_CHANGE_MAX_AGE_MS;
}

export class RepoManager {
  changedArchPackages: ArchlinuxPackage[] = [];
  status: RepoStatus = RepoStatus.INACTIVE;
  private deploymentQueue: Promise<unknown> = Promise.resolve();

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
    @InjectPinoLogger(RepoManager.name) private readonly pino: PinoLogger,
  ) {
    this.pino.info('RepoManager initialized');
  }

  /**
   * Check a single repository for rebuild triggers and commit any bumps.
   * Locking is the caller's concern: `RepoManagerService.run` holds the run
   * lock across all repos, so this method must not gate on `status` itself.
   */
  async startRun(repo: Repo): Promise<BumpResult> {
    this.pino.info({ repo: repo.name }, 'Checking repo for rebuild triggers');

    if (!repo.gitlabProjectId) {
      this.pino.warn({ repo: repo.name }, 'Repo has no gitlabProjectId, skipping rebuild check');
      return { repo: repo.name, bumped: [], origin: TriggerType.ARCH };
    }

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
      if (needsRebuild.length === 0) return { repo: repo.name, bumped: [], origin: TriggerType.ARCH };

      const notYetBumped = await this.bump.dropAlreadyBumpedForArch(needsRebuild);
      const bumpedPackages: PackageBumpEntry[] = await this.bump.bumpAndPush(notYetBumped, reader, repo);

      return {
        repo: repo.name,
        bumped: bumpedPackages,
        origin: TriggerType.ARCH,
      };
    } finally {
      await reader?.dispose();
    }
  }

  async pullArchlinuxPackages(): Promise<void> {
    this.changedArchPackages = await this.archMirror.pullChangedArchPackages(this.settings);
  }

  async scanChangedArchPackages(): Promise<void> {
    await this.archMirror.scanChangedArchPackages(this.changedArchPackages, this.settings);
  }

  /**
   * A change without a current analysis would look unchanged, so it waits for a scan. After UNSCANNED_CHANGE_MAX_AGE_MS it is released, so that a package that never scans is not downloaded on every run.
   */
  async selectScannedChanges(now = new Date()): Promise<void> {
    const scanned = await this.archMirror.withCurrentAnalysis(this.changedArchPackages);
    const unscanned = this.changedArchPackages.filter((pkg) => !scanned.includes(pkg));
    const expired = unscanned.filter((pkg) => isUnscannedChangeExpired(pkg, now));
    if (expired.length > 0) {
      this.pino.error(
        { pkgnames: expired.map((pkg) => pkg.pkgname) },
        'Changed Arch packages never got an analysis, releasing them without rebuild triggers',
      );
      await this.archMirror.clearTriggersPending(expired);
    }

    const waiting = unscanned.length - expired.length;
    if (waiting > 0) {
      this.pino.warn({ unscanned: waiting }, 'Changed Arch packages without analysis stay pending');
    }

    this.changedArchPackages = scanned;
  }

  async markChangesProcessed(): Promise<void> {
    await this.archMirror.clearTriggersPending(this.changedArchPackages);
  }

  async indexArchMirror(): Promise<IndexResult> {
    if (this.status === RepoStatus.ACTIVE) {
      this.pino.warn('RepoManager is already active, skipping full Arch mirror index');
      return { scanned: 0, skipped: 0, failed: 0 };
    }

    this.status = RepoStatus.ACTIVE;
    try {
      return await this.archMirror.indexArchMirror(this.settings);
    } finally {
      this.status = RepoStatus.INACTIVE;
    }
  }

  indexChaoticRepo(dbUrl?: string): Promise<IndexResult> {
    return this.serializeDeploymentWork(() => this.chaoticIndex.indexChaoticRepo(dbUrl));
  }

  isAbiDryRun(): boolean {
    return this.settings.abiDryRun;
  }

  async hasMissedBreaks(): Promise<boolean> {
    const uncovered = await this.triggers.countUncoveredMissedBreaks();

    return uncovered > 0;
  }

  async updateChaoticDatabaseVersions(repos: Repo[]): Promise<void> {
    await this.chaoticIndex.updateChaoticDatabaseVersions(repos);
  }

  private async scanBuiltChaoticPackage(pkg: Package, repoName: string): Promise<void> {
    if (pkg.skipSignalScan) {
      this.pino.info({ pkgname: pkg.pkgname }, 'Skipping scan: marked binary-only (skip signal scan)');
      return;
    }

    const filename: string | undefined = pkg.metadata?.filename;
    if (!filename || !pkg.version) {
      this.pino.error(
        { pkgname: pkg.pkgname, version: pkg.version, filename },
        'No filename or version for built package, skipping scan',
      );
      return;
    }

    const secretMirrorUrl: string | undefined = this.settings.secretMirrorUrl;
    if (!secretMirrorUrl) {
      this.pino.error({ pkgname: pkg.pkgname }, 'No secretMirrorUrl configured, skipping scan');
      return;
    }

    const downloadUrl = `${secretMirrorUrl}/${repoName}/x86_64/${filename}`;
    const tempDir: string = await mkdtemp(join(tmpdir(), 'chaotic-signal-'));
    const downloadPath: string = join(tempDir, filename);
    try {
      await downloadWithRetry(this.httpService.axiosRef, downloadUrl, downloadPath);

      this.pino.info({ pkgname: pkg.pkgname, version: pkg.version }, 'Scanning built package for ELF signals');
      const report = await this.signalScanService.scanPackages([
        {
          file: downloadPath,
          pkgType: TriggerType.CHAOTIC,
          pkgId: pkg.id,
          version: pkg.version,
        },
      ]);

      for (const { reason } of report.failed) {
        this.pino.error({ pkgname: pkg.pkgname, filename, reason }, 'Built package failed to scan');
      }
    } catch (err: unknown) {
      this.pino.error({ err, pkgname: pkg.pkgname, downloadUrl }, 'Failed to download or scan built package');
    } finally {
      await this.archMirror.cleanUp([tempDir]);
    }
  }

  /**
   * A deployment waits for a running one instead of being skipped, because a skipped check loses its rebuilds.
   */
  checkPackageDepsAfterDeployment(build: Partial<Build>): Promise<BumpResult[]> {
    return this.serializeDeploymentWork(() => this.collectPostDeploymentRebuilds(build));
  }

  private serializeDeploymentWork<T>(work: () => Promise<T>): Promise<T> {
    const result = this.deploymentQueue.then(work);
    this.deploymentQueue = result.catch(() => undefined);
    return result;
  }

  /**
   * Every output of the deployed PKGBUILD counts, and each consumer is bumped in its own repo.
   */
  private async collectPostDeploymentRebuilds(build: Partial<Build>): Promise<BumpResult[]> {
    const { repo, pkgbase } = build;
    if (!repo || !pkgbase) return [];

    this.pino.info({ pkgname: pkgbase.pkgname, repo: repo.name }, 'Checking rebuild triggers after deployment');

    const activePackages: Package[] = await this.packagesRepository.find({
      where: { isActive: true },
      relations: { repo: true },
    });

    const deployedOutputs = deployedOutputsOf(pkgbase, repo, activePackages);
    if (this.settings.signalScanEnabled) {
      for (const output of deployedOutputs) {
        await this.scanBuiltChaoticPackage(output, repo.name);
      }

      await this.signalScanService.recomputeBroken();
    }

    const deployedIds = new Set(deployedOutputs.map((pkg) => pkg.id));
    const consumers = activePackages.filter((pkg) => !deployedIds.has(pkg.id));
    const detected = this.settings.signalScanEnabled
      ? await this.triggers.deploymentTriggers(deployedOutputs, consumers)
      : new Map<number, DetectedTrigger>();
    for (const [pkgId, trigger] of explicitTriggers(pkgbase, deployedOutputs, consumers)) {
      detected.set(pkgId, trigger);
    }

    return this.bumpDetectedPerRepo(
      consumers.filter((pkg) => detected.has(pkg.id)),
      detected,
    );
  }

  /**
   * A failed repo does not stop the others.
   */
  private async bumpDetectedPerRepo(
    candidates: Package[],
    detected: Map<number, DetectedTrigger>,
  ): Promise<BumpResult[]> {
    const results: BumpResult[] = [];
    const failedRepos: string[] = [];
    for (const { repo, packages } of groupByRepo(candidates)) {
      if (!repo.gitlabProjectId) {
        this.pino.warn({ repo: repo.name }, 'Repo has no gitlabProjectId, skipping rebuilds after deployment');
        continue;
      }

      try {
        results.push(await this.bumpDetectedInRepo(repo, packages, detected));
      } catch (err: unknown) {
        failedRepos.push(repo.name);
        this.pino.error({ err, repo: repo.name }, 'Rebuilds after deployment failed for repo');
      }
    }

    if (failedRepos.length > 0) {
      throw new Error(`Rebuilds after deployment failed for repos: ${failedRepos.join(', ')}`);
    }

    return results;
  }

  private async bumpDetectedInRepo(
    repo: Repo,
    packages: Package[],
    detected: Map<number, DetectedTrigger>,
  ): Promise<BumpResult> {
    const reader = await this.readerFactory.open(repo);
    try {
      const needsRebuild: RepoUpdateRunParams[] = [];
      for (const [pkgbaseDir, outputs] of groupByPkgbase(packages)) {
        const pkgConfig: PackageConfig = await this.bump.readPackageConfig(reader, {
          pkgbaseDir,
          repo,
          pkgInDb: outputs.find((pkg) => pkg.pkgname === pkgbaseDir),
        });

        const entry = this.deploymentEntry(outputs, detected, pkgConfig, pkgbaseDir);
        if (entry) {
          needsRebuild.push(entry);
        }
      }

      const bumped = await this.bump.bumpAndPush(needsRebuild, reader, repo);
      return { repo: repo.name, bumped, origin: TriggerType.CHAOTIC };
    } finally {
      await reader.dispose();
    }
  }

  /**
   * An explicit trigger ignores the binary-only and ignore-ABI flags.
   */
  private deploymentEntry(
    outputs: Package[],
    detected: Map<number, DetectedTrigger>,
    pkgConfig: PackageConfig,
    pkgbaseDir: string,
  ): RepoUpdateRunParams | null {
    const triggers: DetectedTrigger[] = [];
    for (const pkg of outputs) {
      const trigger = detected.get(pkg.id);
      if (trigger) {
        triggers.push(trigger);
      }
    }

    const explicit = triggers.find((trigger) => trigger.bumpType === BumpType.EXPLICIT);
    if (explicit) {
      this.pino.debug(
        { pkgname: pkgbaseDir, trigger: explicit.archPkg.pkgname },
        'Rebuilding because of explicit trigger',
      );
      return {
        configs: pkgConfig.configs,
        pkg: pkgConfig.pkgInDb,
        archPkg: explicit.archPkg,
        bumpType: BumpType.EXPLICIT,
        triggerFrom: TriggerType.CHAOTIC,
      };
    }

    const signal = triggers[0];
    if (!signal) return null;

    if (!acceptsSignalRebuild(pkgConfig)) return null;

    return this.triggers.buildRebuildEntry({ ...signal, pkgConfig, pkgbaseDir, settings: this.settings });
  }
}

function deployedOutputsOf(pkgbase: Package, repo: Repo, activePackages: Package[]): Package[] {
  const outputs = activePackages.filter((pkg) => pkg.repo.id === repo.id && pkgbaseOf(pkg) === pkgbase.pkgname);
  return outputs.length > 0 ? outputs : [pkgbase];
}

function explicitTriggers(
  pkgbase: Package,
  deployedOutputs: Package[],
  consumers: Package[],
): Map<number, DetectedTrigger> {
  const deployedNames = new Set([pkgbase.pkgname, ...deployedOutputs.map((pkg) => pkg.pkgname)]);
  const triggers = new Map<number, DetectedTrigger>();
  for (const pkg of consumers) {
    if (!pkg.bumpTriggers?.some((trigger) => deployedNames.has(trigger.pkgname))) continue;

    triggers.set(pkg.id, {
      bumpType: BumpType.EXPLICIT,
      archPkg: pkgbase,
      triggerFrom: TriggerType.CHAOTIC,
      reason: `explicit trigger ${pkgbase.pkgname}`,
      details: [],
    });
  }

  return triggers;
}

function groupByRepo(packages: Package[]): { repo: Repo; packages: Package[] }[] {
  const groups = new Map<number, { repo: Repo; packages: Package[] }>();
  for (const pkg of packages) {
    const group = groups.get(pkg.repo.id);
    if (group) {
      group.packages.push(pkg);
    } else {
      groups.set(pkg.repo.id, { repo: pkg.repo, packages: [pkg] });
    }
  }

  return [...groups.values()];
}
