import { Package, Repo } from '../../builder/builder.entity';
import { EntityLookupService } from '../../builder/entity-lookup.service';
import {
  BumpType,
  type PackageBumpEntry,
  type PackageConfig,
  type RepoUpdateRunParams,
} from '../../interfaces/repo-manager';
import { isSourceCompiledPackage } from '../pkgbuild-classifier';
import { PackageBump, PackageElfAnalysis } from '../repo-manager.entity';
import { REPO_WRITER, type BumpCommitAction, type RepoReader, type RepoWriter } from '../repo-rw';
import { CHAOTIC_PKG_TYPE } from '../signal/plugin';
import { applyPackageBump, parseCiConfig } from './bump-config';
import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Repository } from 'typeorm';

/** CI config flag keys (read from .CI/config); a flag is on when set to "1". */
const CI_FLAG_SIGNAL_SCAN_IGNORE = 'CI_SIGNAL_SCAN_IGNORE';

/** Pkgname fragments marking prebuilt binaries; rebuilding those from source makes no sense. */
const NON_SOURCE_PKGNAME_FRAGMENTS = ['-bin', '-appimage', '-snap', '-support', '-meta'] as const;

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
    const bumpedEntries = await this.bumpPackages(needsRebuild, reader);
    const needsPush = needsRebuild.filter((entry) => entry.gotBumped === true);
    await this.pushChanges(needsPush, repo);
    return bumpedEntries;
  }

  async bumpPackages(needsRebuild: RepoUpdateRunParams[], reader: RepoReader): Promise<PackageBumpEntry[]> {
    const bumpedEntries: PackageBumpEntry[] = [];

    for (const param of needsRebuild) {
      if (NON_SOURCE_PKGNAME_FRAGMENTS.some((fragment) => param.pkg.pkgname.includes(fragment))) continue;

      const existingEntry: PackageBumpEntry | undefined = bumpedEntries.find(
        (entry) => entry.pkg.pkgname === param.pkg.pkgname,
      );
      if (existingEntry) {
        this.pino.warn({ trigger: existingEntry.triggerName, pkgname: param.pkg.pkgname }, 'Already bumped, skipping');
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
      const bumpEntry: PackageBumpEntry = {
        pkg: param.pkg,
        bumpType: param.bumpType,
        trigger: param.archPkg.id,
        triggerFrom: param.triggerFrom,
        triggerName,
        details: param.details,
      };
      bumpedEntries.push(bumpEntry);

      this.recordBumpTrigger(param);

      // Persist package + bump atomically.
      await this.packagesRepository.manager.transaction(async (manager) => {
        await manager.save(Package, param.pkg);
        await manager.save(PackageBump, bumpEntry);
      });

      param.gotBumped = true;
    }

    return bumpedEntries;
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

  /** Forwards bumpPackages' rewritten `.CI/config`s to the writer as one atomic commit per repo. */
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
    // When the caller already has the package row (e.g. a batch loop over
    // allPackages), pass it in to skip a getOrCreatePackage() round-trip per call —
    // otherwise this is a mutex-guarded find+relations on every iteration.
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
