import { Package, Repo } from '../../builder/builder.entity';
import { EntityLookupService } from '../../builder/entity-lookup.service';
import {
  BumpType,
  type PackageBumpEntry,
  type PackageConfig,
  type RepoUpdateRunParams,
  TriggerType,
} from '../../interfaces/repo-manager';
import { isSourceCompiledPackage } from '../pkgbuild-classifier';
import { ArchlinuxPackage, PackageBump, PackageElfAnalysis } from '../repo-manager.entity';
import { REPO_WRITER, type BumpCommitAction, type RepoReader, type RepoWriter } from '../repo-rw';
import { CHAOTIC_PKG_TYPE } from '../signal/plugin';
import { applyPackageBump, parseCiConfig } from './bump-config';
import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { In, MoreThanOrEqual, Repository } from 'typeorm';

// A `.CI/config` flag is on when its value is "1".
const CI_FLAG_SIGNAL_SCAN_IGNORE = 'CI_SIGNAL_SCAN_IGNORE';

// Prebuilt binaries cannot be rebuilt from source.
const NON_SOURCE_PKGNAME_FRAGMENTS = ['-bin', '-appimage', '-snap', '-support', '-meta'] as const;

interface PreparedBump {
  param: RepoUpdateRunParams;
  entry: PackageBumpEntry;
}

function archChangeTime(entry: RepoUpdateRunParams): Date | null {
  if (entry.triggerFrom !== TriggerType.ARCH || !(entry.archPkg instanceof ArchlinuxPackage)) return null;

  return entry.archPkg.lastUpdated;
}

export function isCiFlagEnabled(configs: Record<string, string | undefined>, key: string): boolean {
  return configs[key] === '1';
}

/**
 * Executes the bump pipeline: rewrites each flagged package's `.CI/config`
 * (bumpSinglePackage), records a PackageBump row as the audit trail, and
 * commits all rewritten configs back to the repo in one atomic commit.
 */
@Injectable()
export class BumpService {
  constructor(
    @InjectRepository(Package)
    private readonly packagesRepository: Repository<Package>,
    @InjectRepository(PackageElfAnalysis)
    private readonly elfAnalysisRepository: Repository<PackageElfAnalysis>,
    @Inject(REPO_WRITER)
    private readonly repoWriter: RepoWriter,
    private readonly lookup: EntityLookupService,
    @InjectPinoLogger(BumpService.name) private readonly pino: PinoLogger,
  ) {}

  async bumpAndPush(needsRebuild: RepoUpdateRunParams[], reader: RepoReader, repo: Repo): Promise<PackageBumpEntry[]> {
    const prepared = await this.prepareBumps(needsRebuild, reader);
    await this.pushChanges(
      prepared.map(({ param }) => param),
      repo,
    );
    await this.recordBumps(prepared);
    return prepared.map(({ entry }) => entry);
  }

  async dropAlreadyBumpedForArch(needsRebuild: RepoUpdateRunParams[]): Promise<RepoUpdateRunParams[]> {
    const archTriggered = needsRebuild.filter((entry) => archChangeTime(entry) !== null);
    if (archTriggered.length === 0) return needsRebuild;

    const changeTimes = archTriggered.map((entry) => archChangeTime(entry)?.getTime() ?? Number.POSITIVE_INFINITY);
    const earliestChange = new Date(Math.min(...changeTimes));

    const earlierBumps = await this.packagesRepository.manager.find(PackageBump, {
      where: {
        pkg: { id: In(archTriggered.map((entry) => entry.pkg.id)) },
        timestamp: MoreThanOrEqual(earliestChange),
      },
      relations: { pkg: true },
      select: { id: true, timestamp: true, pkg: { id: true } },
    });

    return needsRebuild.filter((entry) => !this.wasBumpedAfterChange(entry, earlierBumps));
  }

  private wasBumpedAfterChange(entry: RepoUpdateRunParams, earlierBumps: PackageBump[]): boolean {
    const changedAt = archChangeTime(entry);
    if (changedAt === null) return false;

    return earlierBumps.some((bump) => bump.pkg.id === entry.pkg.id && bump.timestamp >= changedAt);
  }

  private async prepareBumps(needsRebuild: RepoUpdateRunParams[], reader: RepoReader): Promise<PreparedBump[]> {
    const prepared: PreparedBump[] = [];
    for (const param of needsRebuild) {
      if (NON_SOURCE_PKGNAME_FRAGMENTS.some((fragment) => param.pkg.pkgname.includes(fragment))) continue;

      const existing = prepared.find(({ entry }) => entry.pkg.pkgname === param.pkg.pkgname);
      if (existing) {
        this.pino.warn({ trigger: existing.entry.triggerName, pkgname: param.pkg.pkgname }, 'Already bumped, skipping');
        continue;
      }

      param.bumpedConfigContent = await this.bumpSinglePackage(reader, param.pkg.pkgname, param.pkg.repo);

      if (param.bumpType === BumpType.MANUAL) {
        this.pino.info({ pkgname: param.pkg.pkgname }, 'Rebuilding manually');
      } else {
        this.pino.info(
          { pkgname: param.pkg.pkgname, trigger: param.archPkg.pkgname },
          'Rebuilding because of changed package',
        );
      }

      // A manual bump has no triggering package, so omit the self-referential name.
      const triggerName = param.bumpType === BumpType.MANUAL ? undefined : param.archPkg.pkgname;
      const entry: PackageBumpEntry = {
        pkg: param.pkg,
        bumpType: param.bumpType,
        trigger: param.archPkg.id,
        triggerFrom: param.triggerFrom,
        triggerName,
        details: param.details,
      };

      prepared.push({ param, entry });
      param.gotBumped = true;
    }

    return prepared;
  }

  private async recordBumps(prepared: PreparedBump[]): Promise<void> {
    for (const { param, entry } of prepared) {
      this.recordBumpTrigger(param);
      await this.packagesRepository.manager.transaction(async (manager) => {
        await manager.save(Package, param.pkg);
        await manager.save(PackageBump, entry);
      });
    }
  }

  private recordBumpTrigger(param: RepoUpdateRunParams): void {
    if (param.bumpType === BumpType.MANUAL) return;

    const triggers = param.pkg.bumpTriggers ?? [];
    const existing = triggers.find((trigger) => trigger.pkgname === param.archPkg.pkgname);
    if (existing) {
      existing.archVersion = param.archPkg.version ?? '';
    } else {
      triggers.push({ pkgname: param.archPkg.pkgname, archVersion: param.archPkg.version ?? '' });
    }

    param.pkg.bumpTriggers = triggers;
  }

  /**
   * Forwards prepareBumps' rewritten `.CI/config`s to the writer as one atomic commit per repo.
   */
  async pushChanges(needsRebuild: RepoUpdateRunParams[], repo: Repo): Promise<void> {
    const actions: BumpCommitAction[] = [];
    for (const param of needsRebuild) {
      if (!param.bumpedConfigContent) continue;

      actions.push({
        pkgname: param.pkg.pkgname,
        content: param.bumpedConfigContent,
        bumpType: param.bumpType,
        // A manual bump has no triggering package, so omit the "triggered by" clause.
        triggerName: param.bumpType === BumpType.MANUAL ? undefined : param.archPkg.pkgname,
        details: param.details,
      });
    }

    if (actions.length === 0) return;

    this.pino.info({ count: actions.length, repo: repo.name }, 'Committing bumps via GitLab API');
    await this.repoWriter.commitBumps(repo, actions);
  }

  async readPackageConfig(
    reader: RepoReader,
    opts: { pkgbaseDir: string; repo?: Repo; pkgInDb?: Package },
  ): Promise<PackageConfig> {
    /**
     * When the caller already has the package row (e.g. a batch loop over
     * allPackages), pass it in to skip a getOrCreatePackage() round-trip per call —
     * otherwise this is a mutex-guarded find+relations on every iteration.
     */
    const { pkgbaseDir, repo, pkgInDb } = opts;
    let pkg = pkgInDb;
    if (!pkg) {
      if (!repo) throw new Error(`readPackageConfig for ${pkgbaseDir} needs either pkgInDb or repo`);

      pkg = await this.lookup.getOrCreatePackage(pkgbaseDir, repo);
    }

    const currentTriggersInDb: { pkgname: string; archVersion: string }[] = pkg.bumpTriggers ?? [];

    const configText = await reader.readFile(`${pkgbaseDir}/.CI/config`).catch(() => '');

    const configs = parseCiConfig(configText);
    if (!configs['CI_REBUILD_TRIGGERS'] && currentTriggersInDb.length > 0) {
      this.pino.debug({ pkgbaseDir }, 'Removing rebuild triggers from database');
      pkg.bumpTriggers = null;
      this.savePackageInBackground(pkg);
    }

    const pkgbuildText = await reader.readFile(`${pkgbaseDir}/PKGBUILD`).catch(() => '');
    const skipSignalScan = isCiFlagEnabled(configs, CI_FLAG_SIGNAL_SCAN_IGNORE);
    if (pkg.skipSignalScan !== skipSignalScan) {
      pkg.skipSignalScan = skipSignalScan;
      this.savePackageInBackground(pkg);
    }

    const isSourceCompiled = isSourceCompiledPackage(pkgbuildText);
    await this.updateSourceCompiledFlag(pkg, isSourceCompiled);

    return { configs, pkgInDb: pkg };
  }

  private async updateSourceCompiledFlag(pkg: Package, isSourceCompiled: boolean): Promise<void> {
    try {
      await this.elfAnalysisRepository.update({ pkgType: CHAOTIC_PKG_TYPE, pkgId: pkg.id }, { isSourceCompiled });
    } catch (err: unknown) {
      this.pino.debug({ err, pkgname: pkg.pkgname }, 'Failed to update isSourceCompiled');
    }
  }

  private savePackageInBackground(pkg: Package): void {
    this.packagesRepository.save(pkg).catch((err: unknown) => {
      this.pino.warn({ err, pkgname: pkg.pkgname }, 'Failed to persist package');
    });
  }

  async bumpSinglePackage(reader: RepoReader, pkgname: string, repo: Repo): Promise<string> {
    const pkg = await this.lookup.getOrCreatePackage(pkgname, repo);
    const configText = await reader.readFile(`${pkgname}/.CI/config`);
    return applyPackageBump(configText, pkg.version, pkg.pkgrel);
  }
}
