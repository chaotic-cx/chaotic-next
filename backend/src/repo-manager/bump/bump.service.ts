import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Package, getOrCreatePackage, Repo } from '../../builder/builder.entity';
import { type PackageBumpEntry, type PackageConfig, type RepoUpdateRunParams } from '../../interfaces/repo-manager';
import { errorMessage } from '../../utils/functions';
import { PackageBump } from '../repo-manager.entity';
import { type BumpCommitAction, REPO_WRITER, type RepoReader, type RepoWriter } from '../repo-rw';
import { applyPackageBump, parseCiConfig } from './bump-config';

/** CI config flag keys (read from .CI/config); a flag is on when set to "1". */
const CI_FLAG_SIGNAL_SCAN_IGNORE = 'CI_SIGNAL_SCAN_IGNORE';

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
  private readonly logger = new Logger(BumpService.name);

  constructor(
    @InjectRepository(Package)
    private readonly packagesRepository: Repository<Package>,
    @Inject(REPO_WRITER)
    private readonly repoWriter: RepoWriter,
  ) {}

  async bumpPackages(needsRebuild: RepoUpdateRunParams[], reader: RepoReader): Promise<PackageBumpEntry[]> {
    const bumpedEntries: PackageBumpEntry[] = [];

    for (const param of needsRebuild) {
      if (
        param.pkg.pkgname.includes('-bin') ||
        param.pkg.pkgname.includes('-appimage') ||
        param.pkg.pkgname.includes('-snap') ||
        param.pkg.pkgname.includes('-support') ||
        param.pkg.pkgname.includes('-meta')
      )
        continue;

      const existingEntry: PackageBumpEntry | undefined = bumpedEntries.find(
        (entry) => entry.pkg.pkgname === param.pkg.pkgname,
      );
      if (existingEntry) {
        this.logger.warn(`Already bumped via ${existingEntry.triggerName}, skipping ${param.pkg.pkgname}`);
        continue;
      }

      param.bumpedConfigContent = await this.bumpSinglePackage(reader, param.pkg.pkgname, param.pkg.repo);

      this.logger.log(`Rebuilding ${param.pkg.pkgname} because of changed ${param.archPkg.pkgname}`);
      bumpedEntries.push({
        pkg: param.pkg,
        bumpType: param.bumpType,
        trigger: param.archPkg.id,
        triggerFrom: param.triggerFrom,
        triggerName: param.archPkg.pkgname,
        details: param.details,
      });

      if (!param.pkg.bumpTriggers) {
        param.pkg.bumpTriggers = [{ pkgname: param.archPkg.pkgname, archVersion: param.archPkg.version }];
      } else {
        if (!param.pkg.bumpTriggers.find((trigger) => trigger.pkgname === param.archPkg.pkgname)) {
          param.pkg.bumpTriggers.push({
            pkgname: param.archPkg.pkgname,
            archVersion: param.archPkg.version,
          });
        } else {
          param.pkg.bumpTriggers = param.pkg.bumpTriggers.map((trigger) => {
            if (trigger.pkgname === param.archPkg.pkgname) {
              trigger.archVersion = param.archPkg.version;
            }
            return trigger;
          });
        }
      }

      const bumpEntry: PackageBumpEntry = {
        pkg: param.pkg,
        bumpType: param.bumpType,
        trigger: param.archPkg.id,
        triggerFrom: param.triggerFrom,
        details: param.details,
      };

      // Persist package + bump atomically.
      await this.packagesRepository.manager.transaction(async (manager) => {
        await manager.save(Package, param.pkg);
        await manager.save(PackageBump, bumpEntry);
      });

      param.gotBumped = true;
    }

    return bumpedEntries;
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
        details: param.details,
      });
    }
    if (actions.length === 0) return;

    this.logger.log(`Committing ${actions.length} bump(s) to ${repo.name} via GitLab API`);
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
      pkg = await getOrCreatePackage(pkgbaseDir, this.packagesRepository, repo);
    }
    const currentTriggersInDb: { pkgname: string; archVersion: string }[] = pkg.bumpTriggers ?? [];

    const configText = await reader.readFile(`${pkgbaseDir}/.CI/config`).catch(() => '');

    const configs = parseCiConfig(configText);

    if (!configs['CI_REBUILD_TRIGGERS'] && currentTriggersInDb.length > 0) {
      this.logger.debug(`Removing rebuild triggers for ${pkgbaseDir} from database`);
      pkg.bumpTriggers = null;
      this.savePackageInBackground(pkg);
    }

    // Binary-only packages (vendor installers that are never rebuilt from
    // source) opt out of ELF signal scanning entirely. Persist the flag so the
    // index/scan paths can consult it without re-reading the git config.
    const skipSignalScan = isCiFlagEnabled(configs, CI_FLAG_SIGNAL_SCAN_IGNORE);
    if (pkg.skipSignalScan !== skipSignalScan) {
      pkg.skipSignalScan = skipSignalScan;
      this.savePackageInBackground(pkg);
    }

    return { configs, pkgInDb: pkg };
  }

  private savePackageInBackground(pkg: Package): void {
    this.packagesRepository.save(pkg).catch((err: unknown) => {
      this.logger.warn(`Failed to persist ${pkg.pkgname}: ${errorMessage(err)}`, 'RepoManager');
    });
  }

  async bumpSinglePackage(reader: RepoReader, pkgname: string, repo: Repo): Promise<string> {
    const pkg = await getOrCreatePackage(pkgname, this.packagesRepository, repo);
    const configText = await reader.readFile(`${pkgname}/.CI/config`);
    return applyPackageBump(configText, pkg.version, pkg.pkgrel);
  }
}
