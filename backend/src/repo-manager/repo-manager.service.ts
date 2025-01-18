import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { AxiosResponse } from 'axios';
import { CronJob } from 'cron';
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import { exec } from 'node:child_process';
import * as fs from 'node:fs';
import { PathLike, Stats } from 'node:fs';
import { access, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import util from 'node:util';
import { IsNull, MoreThanOrEqual, Not, Repository } from 'typeorm';
import { Build, Package, pkgnameExists, Repo } from '../builder/builder.entity';
import { ARCH } from '../constants';
import { bumpTypeToText, decryptAes, encryptAes, isValidUrl, pathExists } from '../functions';
import {
  BumpLogEntry,
  BumpResult,
  BumpType,
  NamcapAnalysis,
  PackageBumpEntry,
  PackageConfig,
  ParsedPackage,
  ParsedPackageMetadata,
  RepoSettings,
  RepoStatus,
  RepoUpdateRunParams,
  RepoWorkDir,
  TriggerType,
} from '../interfaces/repo-manager';
import {
  ArchlinuxPackage,
  archPkgExists,
  PackageBump,
  RepoManagerSettings,
  repoSettingsExists,
} from './repo-manager.entity';
import { tmpdir } from 'node:os';
import { F_OK } from 'node:constants';

@Injectable()
export class RepoManagerService {
  initialized = false;
  private repoManager: RepoManager;
  private repos: Repo[];
  private tasks: CronJob[] = [];

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
    @InjectRepository(ArchlinuxPackage)
    private archlinuxPackageRepository: Repository<ArchlinuxPackage>,
    @InjectRepository(Repo)
    private repoRepository: Repository<Repo>,
    @InjectRepository(RepoManagerSettings)
    private settingsRepository: Repository<RepoManagerSettings>,
    @InjectRepository(Package)
    private packageRepository: Repository<Package>,
    @InjectRepository(PackageBump)
    private packageBumpRepository: Repository<PackageBump>,
  ) {
    Logger.log('Initializing RepoManager service...', 'RepoManager');
    void this.init();
  }

  async init(): Promise<void> {
    this.repos = await this.repoRepository.find({ where: { isActive: true, repoUrl: Not(IsNull()) } });

    const runWithThis = this.run.bind(this);
    this.tasks.push(
      new CronJob(
        this.configService.get<string>('repoMan.schedulerInterval'),
        runWithThis, // onTick
        null, // onComplete
        true, // start
        'Europe/Berlin',
      ),
    );

    const globalTriggers: string[] = JSON.parse(this.configService.get<string>('repoMan.globalTriggers'));
    const existingSettings: RepoManagerSettings = await repoSettingsExists('globalTriggers', this.settingsRepository);

    // We explicitly want to encrypt API tokens if they are prefixed with "CLEAR:"
    try {
      const reposWithTokens = await this.repoRepository.find({ where: { apiToken: Not(IsNull()) } });
      const dbKey = this.configService.getOrThrow('app.dbKey');
      for (const repo of reposWithTokens) {
        if (repo.apiToken.startsWith('CLEAR:')) {
          const token = repo.apiToken.split(':')[1];
          repo.apiToken = encryptAes(token, dbKey);
          await this.repoRepository.save(repo);
        }
        Logger.log(`Encrypted token for repo ${repo.name}`);
      }
    } catch (err: unknown) {
      Logger.error(err, 'RepoManager');
    }

    try {
      if (globalTriggers && globalTriggers.length > 0) {
        if (existingSettings?.value) {
          try {
            Logger.log(existingSettings);
            const existing: string[] = JSON.parse(existingSettings.value);
            for (const key of existing) {
              if (!globalTriggers.includes(key)) {
                globalTriggers.push(key);
              }
            }

            await this.settingsRepository.update({ key: 'alwaysRebuild' }, { value: JSON.stringify(globalTriggers) });
          } catch (err: unknown) {}
        } else {
          await this.settingsRepository.save({
            key: 'globalTriggers',
            value: JSON.stringify(globalTriggers),
          });
        }
      } else {
        if (existingSettings) {
          try {
            globalTriggers.push(...JSON.parse(existingSettings.value));
          } catch (err: unknown) {}
        }
      }
    } catch (err: unknown) {
      Logger.error(err, 'RepoManager');
    }

    this.repoManager = this.createRepoManager(globalTriggers);
    this.initialized = true;
    Logger.log(`RepoManager service initialized with ${this.repos.length} repos`, 'RepoManager');
    Logger.log(`Global triggers: ${globalTriggers.length}`, 'RepoManager');
  }

  /**
   * Update the Chaotic-AUR database versions with current information
   * and set any non-existing packages to inactive.
   */
  async updateChaoticVersions(): Promise<void> {
    this.repos = await this.repoRepository.find({ where: { isActive: true, dbPath: Not(IsNull()) } });
    await this.repoManager.updateChaoticDatabaseVersions(this.repos);
  }

  /**
   * Run the RepoManager service, checking for new packages to bump.
   */
  async run(): Promise<void> {
    if (this.repoManager.status === RepoStatus.ACTIVE) {
      Logger.warn('RepoManager is already active, skipping run', 'RepoManager');
      return;
    }

    Logger.log('Starting checking packages for needed rebuilds...', 'RepoManager');
    const workDirs: RepoWorkDir[] = await this.repoManager.pullArchlinuxPackages();

    if (!this.repoManager.changedArchPackages || this.repoManager.changedArchPackages.length === 0) {
      Logger.log('No packages changed in Arch repos, skipping run', 'RepoManager');
      return;
    }

    const results: BumpResult[] = [];
    for (const repo of this.repos) {
      const result: BumpResult = await this.repoManager.startRun(repo);
      results.push(result);
    }

    void this.repoManager.cleanUp(workDirs.map((dir) => dir.workDir));
    this.summarizeChanges(results, this.repoManager);
  }

  /**
   * Create a new RepoManager instance.
   * @returns A new RepoManager instance
   */
  createRepoManager(globalTriggers?: string[], globalBlocklist?: string[]): RepoManager {
    const repoSettings: RepoSettings = {
      gitAuthor: this.configService.getOrThrow<string>('repoMan.gitAuthor'),
      gitEmail: this.configService.getOrThrow<string>('repoMan.gitEmail'),
      gitUsername: this.configService.getOrThrow<string>('repoMan.gitUsername'),
      globalTriggers: globalTriggers ?? JSON.parse(this.configService.getOrThrow<string>('repoMan.globalTriggers')),
      globalBlocklist: globalBlocklist ?? JSON.parse(this.configService.getOrThrow<string>('repoMan.globalBlocklist')),
      regenDatabase: this.configService.getOrThrow('repoMan.regenDatabase'),
    };

    return new RepoManager(
      this.httpService,
      {
        archPkg: this.archlinuxPackageRepository,
        packageBump: this.packageBumpRepository,
        packages: this.packageRepository,
        repo: this.repoRepository,
        settings: this.settingsRepository,
      },
      repoSettings,
      this.configService,
    );
  }

  /**
   * Summarize the changes of the run.
   * @param results An array of results of the run
   * @param repoManager The RepoManager instance
   */
  summarizeChanges(results: BumpResult[], repoManager: RepoManager): void {
    if (!results || !repoManager) return;

    if (results.find((result) => result.origin === TriggerType.ARCH) && repoManager.changedArchPackages) {
      Logger.log(
        `Run was triggered by Arch package updates, ${repoManager.changedArchPackages.length} Arch package(s) were changed`,
        'RepoManager',
      );
    } else if (results.find((result) => result.origin === TriggerType.CHAOTIC)) {
      Logger.log('Run was triggered by a Chaotic-AUR package update', 'RepoManager');
    }

    for (const result of results) {
      if (!result.bumped || result?.bumped?.length === 0) {
        Logger.log(`No packages affected in ${result.repo}`, 'RepoManager');
        continue;
      }
      if (result.repo) {
        Logger.log(`Bumped package(s) in ${result.repo}:`, 'RepoManager');
        for (const res of result.bumped) {
          const bumpType: string = bumpTypeToText(res.bumpType);
          Logger.log(` - ${res.pkg.pkgname} bumped ${bumpType} (${res.triggerName})`, 'RepoManager');
        }
      }
    }
  }

  /**
   * Bump packages depending on a single Build output.
   * @param build The build object
   * @returns A Build object promise that resolves when the bumping is done
   */
  async eventuallyBumpAffected(build: Partial<Build>) {
    const result: BumpResult[] = [await this.repoManager.checkPackageDepsAfterDeployment(build)];
    if (result.length > 0) {
      this.summarizeChanges(result, this.repoManager);
    }
  }

  /**
   * Get the bump logs.
   * @param options The options for the bump logs, current amount, and skip
   * @returns An array of bump log entries
   */
  async getBumpLogs(options: { amount: number; skip: number }): Promise<BumpLogEntry[]> {
    if (!options.amount) options.amount = 100;
    if (!options.skip) options.skip = 0;

    const result: BumpLogEntry[] = [];
    const logEntries: PackageBump[] = await this.packageBumpRepository.find({
      take: options.amount,
      skip: options.skip,
      relations: ['pkg'],
    });

    for (const logEntry of logEntries) {
      const entry: Partial<BumpLogEntry> = {};
      if (logEntry.triggerFrom === TriggerType.ARCH) {
        const trigger: ArchlinuxPackage = await this.archlinuxPackageRepository.findOne({
          where: { id: logEntry.trigger },
        });
        entry.trigger = trigger.pkgname;
      } else if (logEntry.triggerFrom === TriggerType.CHAOTIC) {
        const trigger: Package = await this.packageRepository.findOne({ where: { id: logEntry.trigger } });
        entry.trigger = trigger.pkgname;
      }
      entry.bumpType = logEntry.bumpType;
      entry.timestamp = logEntry.timestamp.toISOString();
      entry.triggerFrom = logEntry.triggerFrom;
      entry.pkgname = logEntry.pkg.pkgname;

      result.push(entry as BumpLogEntry);
    }

    return result;
  }

  /**
   * Process namcap analysis, if available, and save it to the database.
   * @param build The build object
   * @param namcapAnalysis The namcap analysis output
   */
  async processNamcapAnalysis(build: Build, namcapAnalysis: string): Promise<void> {
    if (!namcapAnalysis) return;

    const finalAnalysis: Partial<NamcapAnalysis> = {
      'dependency-detected-satisfied': [],
      'dependency-implicitly-satisfied': [],
      'depends-by-namcap-sight': [],
      'libdepends-by-namcap-sight': [],
      'libdepends-detected-not-included': [],
      'libprovides-by-namcap-sight': [],
      'library-no-package-associated': [],
      'link-level-dependence': [],
    };
    const relevantRules: string[] = Object.keys(finalAnalysis);

    try {
      let namcapLines: string[] = namcapAnalysis.split('\n');
      for (const line of namcapLines) {
        const lineSplit = line.split(': ')[1];
        if (!lineSplit) continue;

        const [rule, result] = lineSplit.split(' ');
        if (!relevantRules.includes(rule)) continue;

        switch (rule) {
          case 'dependency-detected-satisfied': {
            const key = result.split(' ')[0];
            if (key) finalAnalysis[rule].push(key);
            break;
          }
          case 'dependency-implicitly-satisfied': {
            const key = result.split(' ')[0];
            if (key) finalAnalysis[rule].push(key);
            break;
          }
          case 'depends-by-namcap-sight': {
            const depends = result.split(' ')[0];
            const depsText = depends.match(/(?<=\()[^)]+(?=\))/);
            if (!depsText) break;
            finalAnalysis[rule] = depsText[0].split(' ');
            break;
          }
          case 'libdepends-by-namcap-sight': {
            const libDepends = result.split(' ')[0];
            const libDepsText = libDepends.match(/(?<=\()[^)]+(?=\))/);
            if (!libDepsText) break;
            finalAnalysis[rule] = libDepsText[0].split(' ');
            break;
          }
          case 'libdepends-detected-not-included': {
            const key = result.split(' ')[0];
            if (key) finalAnalysis[rule].push(key);
            break;
          }
          case 'libprovides-by-namcap-sight': {
            const libProvides = result.split(' ')[0];
            const libProvidesText = libProvides.match(/(?<=\()[^)]+(?=\))/);
            if (!libProvidesText) break;
            finalAnalysis[rule] = libProvidesText[0].split(' ');
            break;
          }
          case 'link-level-dependence': {
            const key = result.split(' ')[0];
            if (key) finalAnalysis[rule].push(key);
            break;
          }
          case 'library-no-package-associated': {
            const key = result.split(' ')[0];
            if (key) finalAnalysis[rule].push(key);
            break;
          }
        }
      }

      const pkg: Package = build.pkgbase;
      pkg.namcapAnalysis = finalAnalysis;
      void this.packageRepository.save(pkg);
    } catch (err: unknown) {
      Logger.error(err, 'RepoManager');
    }
  }

  /**
   * Helper function for quickly filling the database with namcap analysis.
   */
  async readNamcap(): Promise<void> {
    try {
      const files: string[] = await readdir('/namcap');
      Logger.log(files.length, 'RepoManager');

      for (const file of files) {
        const fileContent: string = await readFile(`/namcap/${file}`, 'utf8');
        const namcapLines: string[] = fileContent.split('\n');
        const namcapAnalysis: Partial<NamcapAnalysis> = {
          'dependency-detected-satisfied': [],
          'dependency-implicitly-satisfied': [],
          'depends-by-namcap-sight': [],
          'libdepends-by-namcap-sight': [],
          'libdepends-detected-not-included': [],
          'libprovides-by-namcap-sight': [],
          'library-no-package-associated': [],
          'link-level-dependence': [],
        };
        const relevantRules: string[] = Object.keys(namcapAnalysis);

        Logger.log(`Processing namcap analysis for ${file}`, 'RepoManager');

        let name: string;
        let pkg: Package;

        for (const line of namcapLines) {
          const [cname, lineSplit] = line.split(': ');
          name = cname.split(' ')[0];

          if (!pkg) pkg = await this.packageRepository.findOne({ where: { pkgname: name } });
          if (!lineSplit || !pkg) continue;

          const [rule, result] = lineSplit.split(' ');
          if (!relevantRules.includes(rule)) continue;

          switch (rule) {
            case 'dependency-detected-satisfied': {
              const key = result.split(' ')[0];
              if (key) namcapAnalysis[rule].push(key);
              break;
            }
            case 'dependency-implicitly-satisfied': {
              const key = result.split(' ')[0];
              if (key) namcapAnalysis[rule].push(key);
              break;
            }
            case 'depends-by-namcap-sight': {
              const depends = result.split(' ')[0];
              const depsText = depends.match(/(?<=\()[^)]+(?=\))/);
              if (!depsText) continue;
              namcapAnalysis[rule] = depsText[0].split(' ');
              break;
            }
            case 'libdepends-by-namcap-sight': {
              const libDepends = result.split(' ')[0];
              const libDepsText = libDepends.match(/(?<=\()[^)]+(?=\))/);
              if (!libDepsText) continue;
              namcapAnalysis[rule] = libDepsText[0].split(' ');
              break;
            }
            case 'libdepends-detected-not-included': {
              const key = result.split(' ')[0];
              if (key) namcapAnalysis[rule].push(key);
              break;
            }
            case 'libprovides-by-namcap-sight': {
              const libProvides = result.split(' ')[0];
              const libProvidesText = libProvides.match(/(?<=\()[^)]+(?=\))/);
              if (!libProvidesText) break;
              namcapAnalysis[rule] = libProvidesText[0].split(' ');
              break;
            }
            case 'link-level-dependence': {
              const key = result.split(' ')[0];
              if (key) namcapAnalysis[rule].push(key);
              break;
            }
            case 'library-no-package-associated': {
              const key = result.split(' ')[0];
              if (key) namcapAnalysis[rule].push(key);
              break;
            }
          }
        }

        if (!pkg) continue;
        pkg.namcapAnalysis = namcapAnalysis;
        void this.packageRepository.save(pkg);
      }
    } catch (err) {
      Logger.error(err, 'RepoManager');
    }
  }
}

/**
 * The RepoManager class is responsible for managing the repositories and checking for packages that need to be rebuilt.
 * It also handles the bumping of packages and pushing the changes to the repository.
 * @class
 * @property changedArchPackages - An array of Archlinux packages that have changed
 * @property status - The status of the RepoManager (Active/inactive
 * @property archlinuxRepos - An array of Archlinux repositories
 * @property archlinuxRepoUrl - A function that returns the URL of an Archlinux repository
 * @property dbConnections - An object containing the database connections
 * @property httpService - The HttpService instance
 * @property repoDirs - An array of repository directories
 * @property repoManagerSettings - The settings of the RepoManager
 */
class RepoManager {
  changedArchPackages?: ArchlinuxPackage[];
  status: RepoStatus = RepoStatus.INACTIVE;
  statusDeploy: RepoStatus = RepoStatus.INACTIVE;

  private readonly archlinuxRepos: string[] = ['core', 'extra'];
  private readonly archlinuxRepoUrl = (name: string) =>
    `https://arch.mirror.constant.com/${name}/os/x86_64/${name}.files`;
  private readonly dbConnections: {
    archPkg: Repository<ArchlinuxPackage>;
    packageBump: Repository<PackageBump>;
    packages: Repository<Package>;
    repo: Repository<any>;
    settings: Repository<RepoManagerSettings>;
  };
  private readonly httpService: HttpService;
  private readonly configService: ConfigService;

  private repoDirs: string[] = [];
  private repoManagerSettings: RepoSettings;

  constructor(
    httpService: HttpService,
    dbConnections: {
      archPkg: Repository<ArchlinuxPackage>;
      packageBump: Repository<PackageBump>;
      packages: Repository<Package>;
      repo: Repository<Repo>;
      settings: Repository<RepoManagerSettings>;
    },
    settings: RepoSettings,
    configService: ConfigService,
  ) {
    this.httpService = httpService;
    this.dbConnections = dbConnections;
    this.repoManagerSettings = settings;
    this.configService = configService;
    this.status = RepoStatus.INACTIVE;
    Logger.log('RepoManager initialized', 'RepoManager');
  }

  /**
   * Clone a repository and check for packages that need to be rebuilt.
   * @param repo The repository to clone
   * @returns An object containing the bumped packages as a map and the repository name
   */
  async startRun(repo: Repo): Promise<BumpResult> {
    Logger.log(`Checking repo ${repo.name} for rebuild triggers...`, 'RepoManager');
    Logger.debug(`Started cloning repo ${repo.name}`, 'RepoManager');

    if (this.status === RepoStatus.ACTIVE) {
      Logger.warn('RepoManager is already active, skipping run', 'RepoManager');
      return { repo: repo.name, bumped: [], origin: TriggerType.ARCH };
    }
    this.status = RepoStatus.ACTIVE;
    const repoDir: string = await this.createRepoDir(repo);

    Logger.debug(`Done cloning ${repo.name}`, 'RepoManager');
    Logger.debug('Started checking for rebuild triggers...', 'RepoManager');

    const pkgbaseDirs: string[] = await this.getDirectories(repoDir);
    const needsRebuild: RepoUpdateRunParams[] = await this.checkRebuildTriggers(pkgbaseDirs, repoDir, repo);

    if (!needsRebuild || needsRebuild.length === 0) {
      this.status = RepoStatus.INACTIVE;
      return { repo: repo.name, bumped: [], origin: TriggerType.ARCH };
    }
    const bumpedPackages: PackageBumpEntry[] = await this.bumpPackages(needsRebuild, repoDir);
    const needsPush = needsRebuild.filter((entry) => entry.gotBumped === true);

    Logger.log(`Pushing changes to ${repo.name}`, 'RepoManager');
    await this.pushChanges(repoDir, needsPush, repo);

    Logger.debug('Done checking for rebuild triggers, cleaning up', 'RepoManager');
    this.cleanUp([repoDir, ...pkgbaseDirs]);
    this.status = RepoStatus.INACTIVE;

    return { repo: repo.name, bumped: bumpedPackages, origin: TriggerType.ARCH };
  }

  /**
   * Check if the repository has a config file and if the packages need to be rebuilt.
   * @param pkgbaseDirs The directories of the packages
   * @param repoDir An object containing the Archlinux package,
   * config of the repo package and the repo package itself
   * @param repo The repository object
   */
  private async checkRebuildTriggers(
    pkgbaseDirs: string[],
    repoDir: string,
    repo: Repo,
  ): Promise<RepoUpdateRunParams[]> {
    const needsRebuild: RepoUpdateRunParams[] = [];

    // Enhance the global triggers with the ones from the global CI config file,
    // additionally process blocklisted packages
    const globalTriggerList: { list: string[]; blacklist: string[] } = await this.checkGlobalTriggers(repoDir);
    const allGlobalTriggers: string[] = [...this.repoManagerSettings.globalTriggers, ...globalTriggerList.list];
    const allGlobalBlocklist: string[] = [...this.repoManagerSettings.globalBlocklist, ...globalTriggerList.blacklist];
    const globalArchRebuildPkg: ArchlinuxPackage[] = this.changedArchPackages.filter((pkg) => {
      return allGlobalTriggers.includes(pkg.pkgname) && !allGlobalBlocklist.includes(pkg.pkgname);
    });

    // Additionally, filter out the .so providing Arch packages from our changed package list
    const soProvidingArchPackages: {
      pkg: ArchlinuxPackage;
      provides: string[];
    }[] = this.getSoProvidingPackages(this.changedArchPackages);

    for (const pkgbaseDir of pkgbaseDirs) {
      let archRebuildPkg: ArchlinuxPackage[];
      const configFile: string = path.join(repoDir, pkgbaseDir, '.CI', 'config');
      const pkgConfig: PackageConfig = await this.readPackageConfig(configFile, pkgbaseDir);
      const metadata: ParsedPackageMetadata = pkgConfig.pkgInDb.metadata;
      let foundTrigger = false;

      archRebuildPkg = this.changedArchPackages.filter((pkg) => {
        return pkgConfig.rebuildTriggers?.includes(pkg.pkgname);
      });

      if (archRebuildPkg.length > 0) {
        needsRebuild.push({
          archPkg: await this.dbConnections.archPkg.findOne({
            where: { pkgname: archRebuildPkg[0].pkgname },
          }),
          configs: pkgConfig.configs,
          pkg: pkgConfig.pkgInDb,
          bumpType: BumpType.EXPLICIT,
          triggerFrom: TriggerType.ARCH,
        });

        Logger.debug(
          `Rebuilding ${pkgbaseDir} because of explicit trigger ${archRebuildPkg[0].pkgname}`,
          'RepoManager',
        );
        foundTrigger = true;
        continue;
      }

      // If no trigger was found in explicit triggers, let's check for global triggers
      for (const globalTrigger of globalArchRebuildPkg) {
        if (metadata?.deps?.includes(globalTrigger.pkgname)) {
          needsRebuild.push({
            archPkg: await this.dbConnections.archPkg.findOne({
              where: { pkgname: globalTrigger.pkgname },
            }),
            configs: pkgConfig.configs,
            pkg: pkgConfig.pkgInDb,
            bumpType: BumpType.GLOBAL,
            triggerFrom: TriggerType.ARCH,
          });

          Logger.log(`Rebuilding ${pkgbaseDir} because of global trigger ${globalTrigger.pkgname}`, 'RepoManager');
          foundTrigger = true;
          break;
        }
      }

      // if (!foundTrigger && soProvidingArchPackages.length > 0 && metadata?.deps) {
      //     const trigger = soProvidingArchPackages.find((soProviding) => {
      //         const hasSoDep = metadata?.deps?.some((dep) => {
      //             const pkgNoSo = dep.split(".so")[0];
      //
      //             // TODO: probably too sensitive and causing too many builds
      //             return soProviding.provides.some(
      //                 (pkg) => pkg.includes(pkgNoSo) || soProviding.pkg.pkgname.includes(pkgNoSo),
      //             );
      //         });
      //
      //         if (hasSoDep) {
      //             Logger.debug(`Found shared library trigger ${soProviding.pkg.pkgname} by name`, "RepoManager");
      //             return true;
      //         }
      //         return false;
      //     });
      //     if (trigger) {
      //         needsRebuild.push({
      //             archPkg: trigger.pkg,
      //             configs: pkgConfig.configs,
      //             pkg: pkgConfig.pkgInDb,
      //             bumpType: BumpType.FROM_DEPS,
      //             triggerFrom: TriggerType.ARCH,
      //         });
      //
      //         Logger.debug(
      //             `Rebuilding ${pkgbaseDir} because of changed shared library ${trigger.pkg.pkgname}`,
      //             "RepoManager",
      //         );
      //         foundTrigger = true;
      //     }
      // }

      if (!foundTrigger && pkgConfig.pkgInDb.namcapAnalysis) {
        const namcapAnalysis: Partial<NamcapAnalysis> = pkgConfig.pkgInDb.namcapAnalysis;
        const relevantKeys = [
          'dependency-detected-satisfied',
          'libdepends-by-namcap-sight',
          'libdepends-detected-not-included',
          'library-no-package-associated',
          'link-level-dependence',
        ];

        for (const key of relevantKeys) {
          let trigger: ArchlinuxPackage;
          if (namcapAnalysis[key]) {
            for (const depPkg of namcapAnalysis[key]) {
              Logger.debug(`${depPkg}`);
              const foundSoProvider: {
                pkg: ArchlinuxPackage;
                provides: string[];
              } = soProvidingArchPackages.find((pkg) => pkg.provides?.includes(depPkg));

              if (foundSoProvider) {
                trigger = foundSoProvider.pkg;
                break;
              }
            }
          }
          if (trigger) {
            needsRebuild.push({
              archPkg: trigger,
              configs: pkgConfig.configs,
              pkg: pkgConfig.pkgInDb,
              bumpType: BumpType.NAMCAP,
              triggerFrom: TriggerType.ARCH,
            });

            Logger.debug(
              `Rebuilding ${pkgbaseDir} because of namcap detected library dep ${trigger.pkgname}`,
              'RepoManager',
            );
            foundTrigger = true;
            break;
          }
        }
      }
    }

    Logger.debug(`Found ${needsRebuild.length} packages to rebuild in ${repo.name}`, 'RepoManager');
    return needsRebuild;
  }

  /**
   * Check for global triggers in the global CI config file
   * @param repoDir The directory of the repository
   * @returns An array of global triggers
   */
  async checkGlobalTriggers(repoDir: string): Promise<{ list: string[]; blacklist: string[] }> {
    const result = {
      list: [],
      blacklist: [],
    };

    try {
      const globalConfigFile = path.join(repoDir, '.ci', 'config');
      const globalConfig = await readFile(globalConfigFile, 'utf8');
      const globalConfigLines = globalConfig.split('\n');
      const relevantEntry = globalConfigLines.find((line) => line.startsWith('CI_REBUILD_TRIGGERS'));
      const relevantEntryBlacklist = globalConfigLines.find((line) => line.startsWith('CI_REBUILD_BLACKLIST'));

      if (relevantEntry) {
        result.list = relevantEntry.split('=')[1].replaceAll(/"/g, '').split(':');
      }
      if (relevantEntryBlacklist) {
        result.blacklist = relevantEntryBlacklist.split('=')[1].replaceAll(/"/g, '').split(':');
      }
    } catch (err: unknown) {
      Logger.error(err, 'RepoManager');
    }
    return result;
  }

  /**
   * Bump the packages in the database.
   * @param needsRebuild The packages that need to be rebuilt
   * @param repoDir The directory of the repository
   * @returns A map of the packages that were bumped
   */
  async bumpPackages(needsRebuild: RepoUpdateRunParams[], repoDir: string): Promise<PackageBumpEntry[]> {
    const alreadyBumped: PackageBumpEntry[] = [];

    // Set cooldown to one week by default, overridable via config
    const date = new Date();
    const daysInPast: number = this.configService.get<number>('repoMan.cooldownDays');
    date.setDate(date.getDate() - daysInPast);

    const packageBumpsLastDay: PackageBump[] = await this.dbConnections.packageBump.find({
      where: { timestamp: MoreThanOrEqual(date) },
      order: { timestamp: 'DESC' },
      relations: ['pkg'],
    });

    Logger.log(`Found ${packageBumpsLastDay.length} bumps in the last ${daysInPast} day(s)`, 'RepoManager');

    // Let's only consider Chaotic rebuilds for now, as Arch ones usually don't occur as often (-git packages)
    const relevantBumps: PackageBump[] = packageBumpsLastDay.filter((bump) => {
      return bump.triggerFrom === TriggerType.CHAOTIC;
    });

    for (const param of needsRebuild) {
      // Skip binary packages, they are not usually compiled against system libraries
      if (
        param.pkg.pkgname.includes('-bin') ||
        param.pkg.pkgname.includes('-appimage') ||
        param.pkg.pkgname.includes('-snap') ||
        param.pkg.pkgname.includes('-support') ||
        param.pkg.pkgname.includes('-meta')
      )
        continue;

      // We also don't want to rebuild packages that have already been bumped within a day
      const needsSkip = relevantBumps.find((bump) => bump.pkg.id === param.pkg.id) !== undefined;
      if (needsSkip) {
        Logger.warn(
          `Already bumped ${param.pkg.pkgname} during the last ${this.configService.get('repoMan.bumpCooldown')} day(s), skipping`,
          'RepoManager',
        );
        continue;
      }

      // We don't want to bump twice, either
      const existingEntry: PackageBumpEntry = alreadyBumped.find((entry) => entry.pkg.pkgname === param.pkg.pkgname);
      if (existingEntry) {
        Logger.warn(`Already bumped via ${existingEntry.triggerName}, skipping ${param.pkg.pkgname}`, 'RepoManager');
        continue;
      }

      await this.bumpSinglePackage(repoDir, param.pkg.pkgname);

      Logger.log(`Rebuilding ${param.pkg.pkgname} because of changed ${param.archPkg.pkgname}`, 'RepoManager');
      alreadyBumped.push({
        pkg: param.pkg,
        bumpType: param.bumpType,
        trigger: param.archPkg.id,
        triggerFrom: param.triggerFrom,
        triggerName: param.archPkg.pkgname,
      });

      if (!param.pkg.bumpTriggers) {
        param.pkg.bumpTriggers = [{ pkgname: param.archPkg.pkgname, archVersion: param.pkg.version }];
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
      void this.dbConnections.packages.save(param.pkg);

      // Indicate we bumped the package
      param.gotBumped = true;

      // We need to update the package in the database to reflect the new bump
      const bumpEntry: PackageBumpEntry = {
        pkg: param.pkg,
        bumpType: param.bumpType,
        trigger: param.archPkg.id,
        triggerFrom: param.triggerFrom,
      };
      void this.dbConnections.packageBump.save(bumpEntry);
    }

    return alreadyBumped;
  }

  /**
   * Pull the Archlinux databases and fill the changedArchPackages array with the packages that have changed.
   */
  async pullArchlinuxPackages(): Promise<RepoWorkDir[]> {
    const tempDir: string = await mkdtemp(path.join(tmpdir(), 'chaotic-'));
    Logger.log('Started pulling Archlinux databases...', 'RepoManager');
    Logger.debug(`Created temporary directory ${tempDir}`, 'RepoManager');

    const downloads: PromiseSettledResult<RepoWorkDir>[] = await Promise.allSettled(
      this.archlinuxRepos.map(async (repo) => {
        const repoUrl = this.archlinuxRepoUrl(repo);
        const repoDir = path.join(tempDir, repo);
        Logger.debug(`Pulling database for ${repo}...`, 'RepoManager');
        try {
          return await this.pullDatabases(repoUrl, repoDir, repo);
        } catch (err: unknown) {
          Logger.error(err, 'RepoManager');
        }
      }),
    );

    Logger.debug('Done pulling all databases', 'RepoManager');

    const currentArchVersions: ParsedPackage[] = await this.parsePacmanDatabases(
      downloads.map((download): RepoWorkDir => (download.status === 'fulfilled' ? download.value : null)),
    );
    this.changedArchPackages = await this.determineChangedPackages(currentArchVersions);

    return downloads.map((download): RepoWorkDir => (download.status === 'fulfilled' ? download.value : null));
  }

  /**
   * Update the database with the versions of our packages and set any non-existing packages to inactive.
   */
  async updateChaoticDatabaseVersions(repos: Repo[]): Promise<void> {
    const tempDir: string = await mkdtemp(path.join(tmpdir(), 'chaotic-'));
    const repoNames: string[] = repos.map((repo) => repo.name);

    Logger.log(`Updating database of ${repoNames.join(', ')}...`, 'RepoManager');
    Logger.debug(`Created temporary directory ${tempDir}`, 'RepoManager');

    const downloads: PromiseSettledResult<RepoWorkDir>[] = await Promise.allSettled(
      repos.map(async (repo): Promise<RepoWorkDir> => {
        return await this.pullDatabases(repo.dbPath, tempDir, `${repo.name}`);
      }),
    );

    Logger.debug('Done pulling all Chaotic-AUR databases', 'RepoManager');
    const workDirs = [];
    for (const download of downloads) {
      if (download.status === 'fulfilled') {
        workDirs.push(download.value);
      }
    }
    const currentChaoticVersions: ParsedPackage[] = await this.parsePacmanDatabases(workDirs);

    Logger.debug('Updating Chaotic database versions...', 'RepoManager');
    await Promise.allSettled(
      currentChaoticVersions.map(async (pkg) => {
        const chaoticPkg: Package = await pkgnameExists(pkg.name, this.dbConnections.packages);

        // Account for already bumped packages
        if (pkg.pkgrel.toString().match(/\./)) {
          chaoticPkg.pkgrel = Number(pkg.pkgrel.toFixed());
        } else {
          chaoticPkg.pkgrel = pkg.pkgrel;
        }
        chaoticPkg.version = pkg.version;
        chaoticPkg.isActive = true;
        chaoticPkg.metadata = pkg.metaData;
        void this.dbConnections.packages.save(chaoticPkg);
      }),
    );
    Logger.log('Finished updating Chaotic database versions', 'RepoManager');

    // Lastly, set any non-existing packages to inactive. The database can contain inactive
    // packages that are not in the Chaotic-AUR database anymore.
    Logger.debug('Setting non-existing packages to inactive...', 'RepoManager');
    const allChaoticVersionsInDb: Package[] = await this.dbConnections.packages.find({});
    for (const pkg of allChaoticVersionsInDb) {
      if (!currentChaoticVersions.find((chaoticPkg) => chaoticPkg.name === pkg.pkgname)) {
        pkg.isActive = false;
        void this.dbConnections.packages.save(pkg);
      }
    }
    Logger.debug('Finished setting non-existing packages to inactive', 'RepoManager');
  }

  /**
   * Pull repository databases and return necessary information.
   * @param dbUrl The URL of the database
   * @param repoDir The directory of the repository
   * @param repo The repository object
   * @returns An object containing the path, name, and workDir of the repository
   */
  async pullDatabases(dbUrl: string, repoDir: string, repo: any): Promise<RepoWorkDir> {
    const dbDownload: AxiosResponse = await this.httpService.axiosRef({
      url: dbUrl,
      method: 'GET',
      responseType: 'arraybuffer',
    });
    const fileData: Buffer = Buffer.from(dbDownload.data, 'binary');
    await mkdir(repoDir, { recursive: true });

    try {
      await writeFile(path.join(repoDir, `${repo}.files`), fileData);
      Logger.debug(`Done pulling database of ${repo}`, 'RepoManager');
      return { path: path.join(repoDir, `${repo}.files`), name: repo, workDir: repoDir };
    } catch (err: unknown) {
      Logger.error(err, 'RepoManager');
    }
  }

  /**
   * Parse the Archlinux databases and return the packages that are relevant for the repository.
   * @param databases The databases to parse as RepoWorkDir objects
   * @returns An array of packages that have changed
   */
  private async parsePacmanDatabases(databases: RepoWorkDir[]): Promise<ParsedPackage[]> {
    Logger.debug('Started extracting databases...', 'RepoManager');
    const workDirsPromises: PromiseSettledResult<RepoWorkDir>[] = await Promise.allSettled(
      databases.map((repo): Promise<RepoWorkDir> => {
        return new Promise<RepoWorkDir>(async (resolve, reject) => {
          try {
            if (!repo.path) reject('Path is null');
            const workDir = repo.path.replace(/\/[^\/]+\.files$/, '');

            Logger.debug(`Unpacking database ${repo.path}`, 'RepoManager');
            // Use native tar due to lack of support for tar.zst in node tar
            const execPromising = util.promisify(exec);
            const { stderr } = await execPromising(`tar -xf ${repo.path} -C ${workDir}`);

            if (stderr) {
              Logger.error(stderr, 'RepoManager');
              reject(stderr);
            }
            resolve({ path: workDir, name: repo.name, workDir });
          } catch (err: unknown) {
            Logger.error(err, 'RepoManager');
            reject(err);
          }
        });
      }),
    );
    Logger.debug('Done extracting databases', 'RepoManager');

    const currentPackageVersions: ParsedPackage[] = [];
    const actualWorkDirs: RepoWorkDir[] = workDirsPromises.map(
      (workDir): RepoWorkDir => (workDir.status === 'fulfilled' ? workDir.value : null),
    );

    Logger.debug('Started parsing databases...', 'RepoManager');
    for (const dir of actualWorkDirs) {
      const currentPathRegex = `/${dir.path}/`;
      const allPkgDirs: string[] = await this.getDirectories(dir.path);
      const relevantFiles = allPkgDirs.map((pkgDir) => {
        const pkg = pkgDir.replace(new RegExp(currentPathRegex), '');
        return { descFile: path.join(dir.path, pkg, 'desc'), filesFile: path.join(dir.path, pkg, 'files') };
      });

      for (const file of relevantFiles) {
        const currentPackageVersion: Partial<ParsedPackage> = await this.parsePackageDesc(file.descFile);
        currentPackageVersion.metaData.soNameList = await this.parsePackageFiles(file.filesFile);
        currentPackageVersions.push(currentPackageVersion as ParsedPackage);
      }
    }

    Logger.debug('Done parsing databases', 'RepoManager');
    return currentPackageVersions;
  }

  /**
   * Determine which packages have changed and update the database accordingly.
   * @param currentArchVersions The current versions of the packages
   * @returns An array of packages that have changed
   */
  private async determineChangedPackages(currentArchVersions: ParsedPackage[]): Promise<ArchlinuxPackage[]> {
    if (currentArchVersions.length === 0) {
      Logger.error('No packages found in databases', 'RepoManager');
      return;
    }

    Logger.log('Started determining changed packages...', 'RepoManager');
    const result: ArchlinuxPackage[] = [];

    let archPkg: ArchlinuxPackage;
    for (const pkg of currentArchVersions) {
      archPkg = await archPkgExists(pkg, this.dbConnections.archPkg);

      if (!this.repoManagerSettings.regenDatabase && archPkg.version && archPkg.version === pkg.version) {
        continue;
      }

      // If we update records, don't
      if (!this.repoManagerSettings.regenDatabase) {
        Logger.log(`Package ${pkg.name} has changed, updating records`, 'RepoManager');
        archPkg.previousVersion = archPkg.version;
        archPkg.lastUpdated = new Date();
      }
      archPkg.version = pkg.version;
      archPkg.arch = ARCH;
      archPkg.pkgrel = pkg.pkgrel;
      archPkg.metadata = pkg.metaData;

      void this.dbConnections.archPkg.save(archPkg);

      // We are only interested in the base packages but still want all metadata saved
      if (pkg.base === pkg.name) result.push(archPkg);
    }

    Logger.debug(
      `Done determining changed packages, in total ${result.length ? result.length : 0} package(s) changed`,
      'RepoManager',
    );
    return result;
  }

  /**
   * Get all directories in a given path, filtering out files.
   * @param srcPath The path to get the directories from
   * @returns An array of directories
   */
  async getDirectories(srcPath: string): Promise<string[]> {
    const pathContent: string[] = await readdir(srcPath);
    return pathContent.filter(async (file) => {
      const dir: Stats = await stat(path.join(srcPath, file));
      return (dir.isDirectory() && !file.startsWith('.')) || file === '.CI';
    });
  }

  /**
   * Parse the desc file of a package and return the relevant information.
   * @param descFile The path to the desc file
   * @returns The parsed package information as an ParsePackage object
   * @private
   */
  private async parsePackageDesc(descFile: string): Promise<Partial<ParsedPackage>> {
    let pkgbaseWithVersions: Partial<ParsedPackage>;
    try {
      const fileData: Buffer = await readFile(descFile);
      const lines: string = fileData.toString();
      pkgbaseWithVersions = this.extractBaseAndVersion(lines);
    } catch (err) {
      return pkgbaseWithVersions;
    }

    return pkgbaseWithVersions;
  }

  /**
   * Parse the .files file of a package and return the shared object names.
   * @param filesFile The path to the files file
   * @returns An array of shared object names
   * @private
   */
  private async parsePackageFiles(filesFile: string): Promise<string[]> {
    let soNameList: string[] = [];
    try {
      const fileData: string = await readFile(filesFile, 'utf-8');
      soNameList = fileData
        .toString()
        .split('\n')
        .filter((line) => !!line.match(/(?=[\S\/]+)\w[^\/]+\.so\.?\d?/))
        .map((line) => line.match(/(?=[\S\/]+)\w[^\/]+\.so\.?\d?/)[0]);
    } catch (err: unknown) {
      Logger.error(err, 'RepoManager');
    }

    return soNameList;
  }

  /**
   * Extract the base and version from a desc file string.
   * @param lines The lines of the desc file
   * @returns The parsed package information as an ParsePackage object
   * @private
   */
  private extractBaseAndVersion(lines: string): Partial<ParsedPackage> {
    const completeVersion: string = lines.match(/(?<=%VERSION%\n)\S+/)[0];
    const splitVersion: string[] = completeVersion.split('-');
    const base = lines.match(/(?<=%BASE%\n)\S+/)[0];
    const buildDate = lines.match(/(?<=%BUILDDATE%\n)\S+/);
    const checkDepends = this.tryMatch('(?<=%CHECKDEPENDS%\\n)[\\s\\S]*?(?=\\n{2})', lines);
    const conflicts = this.tryMatch('(?<=%CONFLICTS%\\n)[\\s\\S]*?(?=\n{2})', lines);
    const deps = this.tryMatch('(?<=%DEPENDS%\\n)[\\s\\S]*?(?=\\n{2})', lines);
    const desc = lines.match(/(?<=%DESC%\n)[\s\S]*?(?=\n{2})/);
    const filename = lines.match(/(?<=%FILENAME%\n)\S+/);
    const license = lines.match(/(?<=%LICENSE%\n)\S+/);
    const makeDeps = this.tryMatch('(?<=%MAKEDEPENDS%\\n)[\\s\\S]*?(?=\\n{2})', lines);
    const name = lines.match(/(?<=%NAME%\n)\S+/)[0];
    const optDeps = this.tryMatch('(?<=%OPTDEPENDS%\\n)[\\s\\S]*?(?=\\n{2})', lines);
    const packager = lines.match(/(?<=%PACKAGER%\n).+$/);
    const pkgrel = Number(completeVersion.split('-')[splitVersion.length - 1]);
    const provides = this.tryMatch('(?<=%PROVIDES%\\n)[\\s\\S]*?(?=\\n{2})', lines);
    const replaces = this.tryMatch('(?<=%REPLACES%\\n)[\\s\\S]*?(?=\\n{2})', lines);
    const url = lines.match(/(?<=%URL%\n)\S+/);
    const version = completeVersion.split('-')[0];

    return {
      base,
      version,
      pkgrel,
      name,
      metaData: {
        buildDate: buildDate ? buildDate[0] : undefined,
        checkDepends: checkDepends ? checkDepends.split('\n') : undefined,
        conflicts: conflicts ? conflicts.split('\n') : undefined,
        deps: deps ? deps.split('\n') : undefined,
        license: license ? license[0] : undefined,
        filename: filename ? filename[0] : undefined,
        makeDeps: makeDeps ? makeDeps.split('\n') : undefined,
        optDeps: optDeps ? optDeps.split('\n') : undefined,
        packager: packager ? packager[0] : undefined,
        desc: desc ? desc[0] : undefined,
        provides: provides ? provides.split('\n') : undefined,
        replaces: replaces ? replaces.split('\n') : undefined,
        url: url ? url[0] : undefined,
      },
    };
  }

  /**
   * Try to match a regex in a source string without failing if the regex is not found.
   * @param regex The regex to match
   * @param source The source string to match the regex in
   * @returns The first matched string or undefined
   * @private
   */
  private tryMatch(regex: string, source: string): string {
    const regExp = new RegExp(regex);
    if (!regExp.test(source)) return undefined;
    return source.match(regExp)[0];
  }

  /**
   * Commits any changed PKGBUILD folders and Pushes the changes to the repository.
   * @param repoDir The directory of the repository
   * @param needsRebuild The array of packages that need to be rebuilt
   * @param repo The repository object
   * @private
   */
  async pushChanges(repoDir: string, needsRebuild: RepoUpdateRunParams[], repo: Repo): Promise<void> {
    Logger.log('Committing changes and pushing back to repo...', 'RepoManager');

    let commitMessage = 'chore(bump): ';
    let commitBody = '';
    let counter = 0;
    for (const param of needsRebuild) {
      try {
        const bumpReason: string = bumpTypeToText(param.bumpType, 2);
        await git.add({ fs, dir: repoDir, filepath: path.join(param.pkg.pkgname, '.CI', 'config') });

        commitMessage += `${param.pkg.pkgname}, `;
        commitBody += `- ${param.pkg.pkgname}: ${bumpReason}\n`;

        if ((counter !== 0 && counter % 2 === 0) || counter === needsRebuild.length - 1) {
          commitMessage = commitMessage.slice(0, commitMessage.length - 2);
          commitMessage += `\n\n${commitBody}`;

          await git.commit({
            fs,
            dir: repoDir,
            author: {
              name: this.repoManagerSettings.gitAuthor,
              email: this.repoManagerSettings.gitEmail,
            },
            message: commitMessage,
          });
          commitMessage = 'chore(bump): ';
          commitBody = '';
        }
        counter++;
      } catch (err: unknown) {
        Logger.error(err, 'RepoManager');
      }
    }

    try {
      const token = decryptAes(repo.apiToken, this.configService.getOrThrow('app.dbKey'));
      await git.push({
        fs,
        http,
        dir: repoDir,
        onAuth: () => ({
          username: this.repoManagerSettings.gitUsername,
          password: token,
        }),
      });

      Logger.debug(`Pushed changes to ${repo.name}`, 'RepoManager');
    } catch (err: unknown) {
      Logger.error(err, 'RepoManager');
    }
  }

  /**
   * Clean up the directories after the repo has been cloned and the packages have been checked.
   * @param dirs The directories to clean up
   */
  cleanUp(dirs: string[]): void {
    try {
      for (const dir of dirs) {
        void rm(dir, { recursive: true });
      }
    } catch (err: unknown) {}
  }

  /**
   * Read the package config file and return the configs and rebuild triggers.
   * @param configFile The path to the config file
   * @param pkgbaseDir The directory of the package
   * @returns An object containing the configs, rebuild triggers, and the package in the database
   * @private
   */
  async readPackageConfig(configFile: PathLike, pkgbaseDir: string): Promise<PackageConfig> {
    const pkgInDb: Package = await pkgnameExists(pkgbaseDir, this.dbConnections.packages);
    const currentTriggersInDb: { pkgname: string; archVersion: string }[] = pkgInDb.bumpTriggers ?? [];
    let configText: string;
    let configLines: string[];

    try {
      configText = await readFile(configFile, 'utf8');

      if (configText || configText !== '') {
        configLines = configText.split('\n');
      }
    } catch (err: unknown) {}

    const configs = {};
    let rebuildTriggers: string[];

    if (configLines && configLines.length > 0) {
      for (const line of configLines) {
        const [key, value] = line.split('=');
        configs[key] = value;
      }
    }

    try {
      if (!configs['CI_REBUILD_TRIGGERS']) {
        if (currentTriggersInDb.length > 0) {
          Logger.debug(`Removing rebuild triggers for ${pkgbaseDir} from database`, 'RepoManager');
          pkgInDb.bumpTriggers = null;
          void this.dbConnections.packages.save(pkgInDb);
        }
        rebuildTriggers = [];
      } else {
        rebuildTriggers = configs['CI_REBUILD_TRIGGERS'].split(':');
        Logger.log(`Found ${rebuildTriggers.length} rebuild trigger(s) for ${pkgbaseDir}`, 'RepoManager');
      }
    } catch (err: unknown) {
      Logger.error(err, 'RepoManager');
    }

    return { configs, rebuildTriggers, pkgInDb };
  }

  /**
   * Create a directory for the repository and clones it to create a work directory.
   * Additionally, the repository is added to the repoDirs array of the RepoManager class.
   * @param repo The repository to clone as object
   * @returns The path to the repository directory
   * @private
   */
  private async createRepoDir(repo: Repo): Promise<string> {
    const repoDir: string = await mkdtemp(path.join(tmpdir(), repo.name));
    try {
      await access(repoDir, F_OK);
      if (!isValidUrl(repo.repoUrl)) {
        Logger.error(`Invalid URL for ${repo.name}`, 'RepoManager');
      }

      Logger.debug('Creating repos directory', 'RepoManager');
      Logger.debug(`Cloning ${repo.name} from ${repo.repoUrl}`, 'RepoManager');
      await git.clone({
        fs,
        http,
        dir: repoDir,
        url: repo.repoUrl,
        ref: repo.gitRef ? repo.gitRef : 'main',
        singleBranch: true,
      });
    } catch (err: unknown) {
      Logger.error(err, 'RepoManager');
      throw new Error(err as string);
    }

    this.repoDirs.push(repoDir);
    return repoDir;
  }

  /**
   * Get the package config of a PKGBUILD folder.
   * @param repoDir The root directory of the repository
   * @param pkgname The name of the package, optional
   * @returns An array of PackageConfig objects, if a pkgname is provided,
   * the array will contain only one object
   */
  async getPackageConfig(repoDir: string, pkgname?: string): Promise<PackageConfig[]> {
    const pkgbaseFolders: string[] = await this.getDirectories(repoDir);
    const result = [];
    if (pkgname) {
      const configFile = path.join(repoDir, pkgname, '.CI', 'config');
      const pkgConfig: PackageConfig = await this.readPackageConfig(configFile, pkgname);
      result.push(pkgConfig);
    } else {
      for (const folder in pkgbaseFolders) {
        const configFile = path.join(repoDir, folder, '.CI', 'config');
        const pkgConfig: PackageConfig = await this.readPackageConfig(configFile, folder);
        result.push(pkgConfig);
      }
    }

    return result;
  }

  /**
   * Bump a single package in the database and writes the new version to the package config.
   * @param repoDir The directory of the repository
   * @param pkgname The name of the package
   */
  async bumpSinglePackage(repoDir: string, pkgname: string): Promise<void> {
    const pkgConfig = await this.readPackageConfig(path.join(repoDir, pkgname, '.CI', 'config'), pkgname);
    if (pkgConfig.configs['CI_PACKAGE_BUMP']) {
      const bumpCount = pkgConfig.configs['CI_PACKAGE_BUMP'].split('/')[1];
      const newVer = `${pkgConfig.pkgInDb.version}-${pkgConfig.pkgInDb.pkgrel}`;

      if (bumpCount) {
        const newBumpCount = Number(bumpCount) + 1;
        pkgConfig.configs['CI_PACKAGE_BUMP'] = `${newVer}/${newBumpCount}`;
      } else {
        pkgConfig.configs['CI_PACKAGE_BUMP'] = `${newVer}/1`;
      }
    } else {
      pkgConfig.configs['CI_PACKAGE_BUMP'] = `${pkgConfig.pkgInDb.version}-${pkgConfig.pkgInDb.pkgrel}/1`;
    }

    // Cleanup and ensure we have a .CI directory to write to
    if (await pathExists(path.join(repoDir, pkgConfig.pkgInDb.pkgname, '.CI', 'config'))) {
      await rm(path.join(repoDir, pkgConfig.pkgInDb.pkgname, '.CI', 'config'));
    } else if (!(await pathExists(path.join(repoDir, pkgConfig.pkgInDb.pkgname, '.CI')))) {
      await mkdir(path.join(repoDir, pkgConfig.pkgInDb.pkgname, '.CI'), { recursive: true });
    }

    // Prevent CI uselessly rewriting config files because of non-alphabetic order
    const writeBack: [string, string][] = Object.entries(pkgConfig.configs);
    writeBack.sort();
    for (const [key, value] of writeBack) {
      try {
        if (key === 'pkg' || (key || value) === undefined) continue;
        await writeFile(path.join(repoDir, pkgConfig.pkgInDb.pkgname, '.CI', 'config'), `${key}=${value}\n`, {
          flag: 'a',
        });
      } catch (err: unknown) {
        Logger.error(err, 'RepoManager');
      }
    }
  }

  /**
   * Get the packages of Arch repositories that provide shared objects.
   * @param packages The packages to check
   * @returns An array of packages that provide shared objects, and their provides
   */
  getSoProvidingPackages(packages: ArchlinuxPackage[]): { pkg: ArchlinuxPackage; provides: string[] }[] {
    const result: { pkg: ArchlinuxPackage; provides: string[] }[] = [];

    try {
      for (const archPkg of packages) {
        if (archPkg.metadata) {
          const metadata: ParsedPackageMetadata = archPkg.metadata;
          if (metadata.provides) {
            for (const provided of metadata.provides) {
              if (provided.match(/\.so=\d+-\d+/)) {
                result.push({ pkg: archPkg, provides: metadata.provides });
                Logger.debug(`${archPkg.pkgname} provides ${provided}, adding to list`, 'RepoManager');
                break;
              }
            }
          }
        }
      }

      Logger.debug(`Found ${result.length} packages providing shared objects`, 'RepoManager');
      return result;
    } catch (err: unknown) {
      Logger.error(err, 'RepoManager');
    }
  }

  /**
   * Check the dependencies of a package after deployment and bump the packages that depend on it.
   * Intended to be used after a package has been deployed.
   * @param build The build object of the package that was deployed
   * @returns A map of the bumped package
   */
  async checkPackageDepsAfterDeployment(build: Partial<Build>): Promise<BumpResult> {
    if (this.statusDeploy === RepoStatus.ACTIVE) {
      Logger.warn('Deployment is already in progress, skipping', 'RepoManager');
      return { repo: build.repo.name, bumped: [], origin: TriggerType.CHAOTIC };
    }
    this.statusDeploy = RepoStatus.ACTIVE;

    try {
      const allPackages: Package[] = await this.dbConnections.packages.find({ where: { isActive: true } });
      const needsRebuild: RepoUpdateRunParams[] = [];
      const soNameList: string[] = build.pkgbase.metadata?.soNameList ?? [];
      let repoDir: string | undefined = this.repoDirs.find((repo) => {
        try {
          access(path.join(repo, build.pkgbase.pkgname), F_OK);
          return true;
        } catch (err: unknown) {
          return false;
        }
      });

      // Pull any changes that might have occurred in the meantime,
      // if no repoDir is found, we need to clone the repo
      try {
        if (!repoDir) {
          repoDir = await this.createRepoDir(build.repo);
        } else {
          const token = decryptAes(build.repo.apiToken, this.configService.getOrThrow('app.dbKey'));
          await git.pull({
            fs,
            http,
            dir: repoDir,
            author: { name: this.repoManagerSettings.gitAuthor, email: this.repoManagerSettings.gitEmail },
            onAuth: () => ({
              username: this.repoManagerSettings.gitUsername,
              password: token,
            }),
          });
        }
      } catch (err: any) {
        Logger.error(err, 'RepoManager');

        // Isomorphic-git does not support rebases. Let's wipe the repo dir and clone it
        try {
          await rm(repoDir, { recursive: true });
          repoDir = await this.createRepoDir(build.repo);
        } catch (err: unknown) {
          Logger.error(err, 'RepoManager');
        }
      }

      for (const pkg of allPackages) {
        const configs: PackageConfig = await this.readPackageConfig(
          path.join(repoDir, pkg.pkgname, '.CI', 'config'),
          pkg.pkgname,
        );

        if (
          pkg.metadata?.deps?.includes(build.pkgbase.pkgname) ||
          soNameList.find((soName) => pkg.metadata?.deps?.includes(soName))
        ) {
          needsRebuild.push({
            configs: configs.configs,
            pkg,
            archPkg: build.pkgbase,
            bumpType: BumpType.FROM_DEPS,
            triggerFrom: TriggerType.CHAOTIC,
          });
          Logger.debug(
            `Rebuilding ${pkg.pkgname} because of changed dependency ${build.pkgbase.pkgname}`,
            'RepoManager',
          );
          continue;
        }

        if (pkg.bumpTriggers) {
          if (pkg.bumpTriggers.find((trigger) => trigger.pkgname === build.pkgbase.pkgname)) {
            needsRebuild.push({
              configs: configs.configs,
              pkg,
              archPkg: build.pkgbase,
              bumpType: BumpType.EXPLICIT,
              triggerFrom: TriggerType.CHAOTIC,
            });
            Logger.debug(
              `Rebuilding ${pkg.pkgname} because of explicit trigger ${build.pkgbase.pkgname}`,
              'RepoManager',
            );
            continue;
          }
        }

        if (pkg.namcapAnalysis) {
          const namcapAnalysis: Partial<NamcapAnalysis> = pkg.namcapAnalysis;
          const relevantKeys = [
            'dependency-detected-satisfied',
            'libdepends-by-namcap-sight',
            'libdepends-detected-not-included',
            'library-no-package-associated',
            'link-level-dependence',
          ];

          for (const key of relevantKeys) {
            const includesSoName: boolean = namcapAnalysis[key]?.find((dep: string) => {
              return soNameList?.includes(dep) ?? false;
            });
            if (!includesSoName) continue;

            needsRebuild.push({
              configs: configs.configs,
              pkg,
              archPkg: build.pkgbase,
              bumpType: BumpType.NAMCAP,
              triggerFrom: TriggerType.CHAOTIC,
            });
            Logger.debug(
              `Rebuilding ${pkg.pkgname} because of ${build.pkgbase.pkgname} in namcap analysis`,
              'RepoManager',
            );
            break;
          }
        }
      }

      const bumped: PackageBumpEntry[] = await this.bumpPackages(needsRebuild, repoDir);
      const needsPush = needsRebuild.filter((entry) => entry.gotBumped === true);

      if (bumped.length > 0) {
        await this.pushChanges(repoDir, needsPush, build.repo);
      }

      this.statusDeploy = RepoStatus.INACTIVE;

      return {
        repo: build.repo.name,
        bumped: bumped,
        origin: TriggerType.CHAOTIC,
      };
    } catch (err: unknown) {
      Logger.error(err, 'RepoManager');
    }
  }

  private hasVersionedSo(soDep: string): string | null {
    return soDep.match(/(?=[\S\/]+)\w[^\/]+\.so\.?\d?/)[0];
  }
}
