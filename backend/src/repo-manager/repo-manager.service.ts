import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import path from "node:path";
import * as fs from "node:fs";
import http from "isomorphic-git/http/node";
import git, { PushResult } from "isomorphic-git";
import { ArchRepoToCheck, ParsedPackage, RepoSettings, RepoStatus } from "../interfaces/repo-manager";
import { ArchlinuxPackage, archPkgExists, RepoManagerSettings } from "./repo-manager.entity";
import * as os from "node:os";
import * as tar from "tar";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Not, Repository } from "typeorm";
import { ARCH } from "../constants";
import { Package, pkgnameExists, Repo } from "../builder/builder.entity";
import { ConfigService } from "@nestjs/config";
import { AxiosResponse } from "axios";
import { isValidUrl } from "../functions";
import { CronJob } from "cron";

@Injectable()
export class RepoManagerService {
    private readonly repoManager: RepoManager;
    private repos: Repo[];
    private tasks: CronJob[] = [];
    initialized = false;

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
    ) {
        Logger.log("Initializing RepoManager service...", "RepoManager");

        this.repoManager = this.createRepoManager();
        void this.init();
    }

    async init(): Promise<void> {
        this.repos = await this.repoRepository.find({ where: { isActive: true, repoUrl: Not(IsNull()) } });
        this.tasks.push(
            new CronJob(
                this.configService.get<string>("repoMan.schedulerInterval"),
                this.run, // onTick
                null, // onComplete
                true, // start
                "Europe/Berlin",
            ),
        );

        this.initialized = true;
        Logger.log(`RepoManager service initialized with ${this.repos.length} repos`, "RepoManager");
    }

    async run() {
        if (!this.initialized) {
            Logger.warn("RepoManager service not initialized, skipping run", "RepoManager");
            return;
        }

        let repoManager: RepoManager;
        if (!this.repoManager) {
            repoManager = this.createRepoManager();
        } else {
            repoManager = this.repoManager;
        }

        if (repoManager.status === RepoStatus.ACTIVE) {
            Logger.warn("RepoManager is already active, skipping run", "RepoManager");
            return;
        }

        // Timer to measure the time it takes to run the whole process
        const start = new Date();

        Logger.log("Starting checking packages for needed rebuilds...", "RepoManager");
        await this.repoManager.pullArchlinuxPackages();

        if (!this.repoManager.changedArchPackages || this.repoManager.changedArchPackages.length === 0) {
            Logger.log("No packages changed in Arch repos, skipping run", "RepoManager");
            return;
        }

        for (const repo of this.repos) {
            await this.repoManager.startRun(repo);
        }
        Logger.log(
            `Done checking packages for needed rebuilds after ${this.measureTime(start)} minutes`,
            "RepoManager",
        );
    }

    /**
     * Measure the time it took to run the whole process.
     * @param start The start time as Date object
     * @returns The time it took to run the whole process in minutes
     */
    measureTime(start: Date): number {
        const end = new Date();
        return start.getHours() * 60 + end.getMinutes() - start.getHours() * 60 - end.getMinutes();
    }

    /**
     * Create a new RepoManager instance.
     * @returns A new RepoManager instance
     */
    createRepoManager() {
        const repoSettings: RepoSettings = {
            gitAuthor: this.configService.getOrThrow<string>("repoMan.gitAuthor"),
            gitEmail: this.configService.getOrThrow<string>("repoMan.gitEmail"),
            gitUsername: this.configService.getOrThrow<string>("repoMan.gitUsername"),
            gitlabToken: this.configService.getOrThrow<string>("repoMan.gitlabToken"),
            alwaysRebuild: JSON.parse(this.configService.getOrThrow<string>("repoMan.alwaysRebuild")),
        };

        return new RepoManager(
            this.httpService,
            {
                archPkg: this.archlinuxPackageRepository,
                settings: this.settingsRepository,
                repo: this.repoRepository,
                packages: this.packageRepository,
            },
            repoSettings,
        );
    }
}

class RepoManager {
  changedArchPackages?: ParsedPackage[];
  status: RepoStatus = RepoStatus.INACTIVE;
  private readonly httpService: HttpService;
  private readonly archlinuxRepos: string[] = ["core", "extra"];
  private readonly archlinuxRepoUrl = (name: string) =>
    `https://arch.mirror.constant.com/${name}/os/x86_64/${name}.db.tar.gz`;

  private readonly dbConnections: {
    archPkg: Repository<ArchlinuxPackage>;
    packages: Repository<Package>;
    repo: Repository<any>;
    settings: Repository<RepoManagerSettings>;
  };
  private repoManagerSettings: RepoSettings;

  constructor(
    httpService: HttpService,
    dbConnections: {
      archPkg: Repository<ArchlinuxPackage>;
      settings: Repository<RepoManagerSettings>;
      repo: Repository<Repo>;
      packages: Repository<Package>;
    },
    settings: RepoSettings
  ) {
    this.httpService = httpService;
    this.dbConnections = dbConnections;
    this.repoManagerSettings = settings;
    this.status = RepoStatus.INACTIVE;
    Logger.log("RepoManager initialized", "RepoManager");
  }

  /**
   * Clone a repository and check for packages that need to be rebuilt.
   * @param repo The repository to clone
   */
  async startRun(repo: Repo): Promise<void> {
    Logger.log(`Checking repo ${repo.name} for rebuild triggers...`, "RepoManager");
    this.status = RepoStatus.ACTIVE;
    Logger.log(`Started cloning repo ${repo.name}`, "RepoManager");

    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), repo.name));
    try {
      if (fs.existsSync(repoDir)) {
        if (!isValidUrl(repo.repoUrl)) {
          throw new Error("Invalid URL");
        }

        Logger.debug("Creating repos directory", "RepoManager");
        Logger.debug(`Cloning ${repo.name} from ${repo.repoUrl}`, "RepoManager");
        await git.clone({
          fs,
          http,
          dir: repoDir,
          url: repo.repoUrl,
          ref: repo.gitRef ? repo.gitRef : "main",
          singleBranch: true
        });
      }
    } catch (err: unknown) {
      Logger.error(err, "RepoManager");
      throw new Error(err as string);
    }

    Logger.log(`Done cloning ${repo.name}`, "RepoManager");

    const pkgbaseDirs: string[] = this.getDirectories(repoDir);
    const alreadyBumped = new Map<string, string>();
    const needsRebuild: { pkg: ParsedPackage; configObj: any }[] = [];

    Logger.log("Started checking for rebuild triggers...", "RepoManager");

    for (const pkgbaseDir of pkgbaseDirs) {
      const configFile = path.join(repoDir, pkgbaseDir, ".CI", "config");
      if (fs.existsSync(configFile)) {
        const pkgInDb = await pkgnameExists(pkgbaseDir, this.dbConnections.packages);

        const config = fs.readFileSync(configFile, "utf8");
        const configLines = config.split("\n");
        const configObj = configLines.reduce((acc, line) => {
          const [key, value] = line.split("=");
          acc[key] = value;
          acc["pkg"] = pkgInDb;
          return acc;
        }, {});

        const currentTriggersInDb: { pkgname: string; archVersion: string }[] = pkgInDb.bumpTriggers ?? [];
        if (!configObj["CI_REBUILD_TRIGGERS"]) {
          if (currentTriggersInDb.length > 0) {
            Logger.debug(`Removing rebuild triggers for ${pkgbaseDir} from database`, "RepoManager");
            pkgInDb.bumpTriggers = null;
          }
          continue;
        }

        const rebuildTriggers: string[] = configObj["CI_REBUILD_TRIGGERS"].split(":");
        Logger.log(`Found ${rebuildTriggers.length} rebuild triggers for ${pkgbaseDir}`, "RepoManager");

        const rebuildPackages: ParsedPackage[] = this.changedArchPackages.filter((pkg) => {
          return rebuildTriggers.includes(pkg.base);
        });

        for (const rebuildPackage of rebuildPackages) {
          needsRebuild.push({ pkg: rebuildPackage, configObj });
        }

        Logger.log(`Found ${needsRebuild.length} packages to rebuild in ${repo.name}`, "RepoManager");
      }
    }

    for (const rebuildPackage of needsRebuild) {
      if (alreadyBumped.has(rebuildPackage.configObj.pkg.pkgname)) {
        Logger.warn(
          `Already bumped via ${alreadyBumped.get(rebuildPackage.configObj.pkg.pkgname)}`,
          "RepoManager"
        );
        continue;
      }

      const repoPkg = rebuildPackage.configObj.pkg as Package;
      repoPkg.bumpCount ? repoPkg.bumpCount++ : (repoPkg.bumpCount = 1);

      if (rebuildPackage.configObj["CI_PKGBUILD_BUMP"]) {
        const bumpCount = rebuildPackage.configObj["CI_PKGBUILD_BUMP"].split("/");
        if (bumpCount.length === 2) {
          rebuildPackage.configObj["CI_PKGBUILD_BUMP"] =
            `${rebuildPackage.pkg.version}/${Number(bumpCount[1]) + 1}`;
        } else {
          rebuildPackage.configObj["CI_PKGBUILD_BUMP"] = `${rebuildPackage.pkg.version}`;
        }
      } else {
        rebuildPackage.configObj["CI_PKGBUILD_BUMP"] = `${rebuildPackage.pkg.version}`;
      }

      alreadyBumped.set(repoPkg.pkgname, rebuildPackage.pkg.base);
      Logger.log(`Rebuilding ${repoPkg.pkgname} because of changed ${rebuildPackage.pkg.base}`, "RepoManager");

      if (!repoPkg.bumpTriggers) {
        repoPkg.bumpTriggers = [{ pkgname: rebuildPackage.pkg.base, archVersion: rebuildPackage.pkg.version }];
      } else {
        if (!repoPkg.bumpTriggers.find((trigger) => trigger.pkgname === rebuildPackage.pkg.base)) {
          repoPkg.bumpTriggers.push({
            pkgname: rebuildPackage.pkg.base,
            archVersion: rebuildPackage.pkg.version
          });
        } else {
          repoPkg.bumpTriggers = repoPkg.bumpTriggers.map((trigger) => {
            if (trigger.pkgname === rebuildPackage.pkg.base) {
              trigger.archVersion = rebuildPackage.pkg.version;
            }
            return trigger;
          });
        }
      }

      void this.dbConnections.packages.save(repoPkg);

      for (const [key, value] of Object.entries(rebuildPackage.configObj)) {
        if (key === "pkg") continue;
        if (fs.existsSync(path.join(repoDir, repoPkg.pkgname, ".CI", "config"))) {
          fs.rmSync(path.join(repoDir, repoPkg.pkgname, ".CI", "config"));
        }
        fs.writeFileSync(path.join(repoDir, repoPkg.pkgname, ".CI", "config"), `${key}=${value}\n`, {
          flag: "a"
        });
      }
    }

    if (needsRebuild.length !== 0) {
      Logger.log(`Pushing changes to ${repo.name}`, "RepoManager");
      await this.pushChanges(repoDir, needsRebuild, repo);
    }

    Logger.log("Done checking for rebuild triggers", "RepoManager");

    this.cleanUp([repoDir, ...pkgbaseDirs]);
    this.summarizeChanges(alreadyBumped);
    this.status = RepoStatus.INACTIVE;
  }

  /**
   * Pull the Archlinux databases and fill the changedArchPackages array with the packages that have changed.
   */
  async pullArchlinuxPackages(): Promise<void> {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "chaotic-"));
    Logger.log(`Started pulling Archlinux databases...`, "RepoManager");
    Logger.debug(`Created temporary directory ${tempDir}`, "RepoManager");

    const downloads = await Promise.allSettled(
      this.archlinuxRepos.map((repo) => {
        return new Promise<ArchRepoToCheck>(async (resolve, reject) => {
          const repoUrl = this.archlinuxRepoUrl(repo);
          const repoDir = path.join(tempDir, repo);
          Logger.debug(`Pulling database for ${repo}...`, "RepoManager");
          try {
            const dbDownload: AxiosResponse = await this.httpService.axiosRef({
              url: repoUrl,
              method: "GET",
              responseType: "arraybuffer"
            });
            const fileData: Buffer = Buffer.from(dbDownload.data, "binary");
            fs.mkdirSync(repoDir, { recursive: true });
            fs.writeFileSync(path.join(repoDir, `${repo}.db.tar.gz`), fileData);

            Logger.debug(`Done pulling database of ${repo}`, "RepoManager");
            resolve({ path: path.join(repoDir, `${repo}.db.tar.gz`), name: repo, workDir: repoDir });
          } catch (err: unknown) {
            Logger.error(err, "RepoManager");
            reject(err);
          }
        });
      })
    );

    Logger.debug("Done pulling all databases", "RepoManager");
    this.changedArchPackages = await this.parseArchlinuxDatabase(
      downloads.map((download): ArchRepoToCheck => (download.status === "fulfilled" ? download.value : null))
    );
  }

  /**
   * Parse the Archlinux databases and return the packages that are relevant for the repository.
   * @param databases The databases to parse as ArchRepoToCheck objects
   * @returns An array of packages that have changed
   */
  async parseArchlinuxDatabase(databases: ArchRepoToCheck[]): Promise<ParsedPackage[]> {
    Logger.log("Started extracting databases...", "RepoManager");
    const workDirsPromises: PromiseSettledResult<ArchRepoToCheck>[] = await Promise.allSettled(
      databases.map((repo): Promise<ArchRepoToCheck> => {
        return new Promise<ArchRepoToCheck>((resolve, reject) => {
          try {
            if (!repo.path) reject("Path is null");
            const workDir = repo.path.replace(/\/[^\/]+\.db\.tar\.gz$/, "");
            Logger.debug(`Parsing database ${repo.path}`, "RepoManager");
            tar.x({ f: repo.path, sync: true, cwd: workDir });
            resolve({ path: workDir, name: repo.name, workDir });
          } catch (err: unknown) {
            Logger.error(err, "RepoManager");
            reject(err);
          }
        });
      })
    );
    Logger.log("Done extracting databases", "RepoManager");

    const currentArchVersions: ParsedPackage[] = [];
    const actualWorkDirs: ArchRepoToCheck[] = workDirsPromises.map(
      (workDir): ArchRepoToCheck => (workDir.status === "fulfilled" ? workDir.value : null)
    );

    Logger.log("Started parsing databases...", "RepoManager");
    for (const dir of actualWorkDirs) {
      const currentPathRegex = `/${dir.path}/`;
      const allPkgDirs: string[] = this.getDirectories(dir.path);
      const relevantFiles = allPkgDirs.map((pkgDir) => {
        const pkg = pkgDir.replace(new RegExp(currentPathRegex), "");
        return { descFile: path.join(dir.path, pkg, "desc") };
      });

      for (const file of relevantFiles) {
        currentArchVersions.push(this.parsePackageDesc(file.descFile));
      }
    }

    Logger.log("Done parsing databases", "RepoManager");
    return this.determineChangedPackages(currentArchVersions);
  }

  /**
   * Determine which packages have changed and update the database accordingly.
   * @param currentArchVersions The current versions of the packages
   * @returns An array of packages that have changed
   */
  async determineChangedPackages(currentArchVersions: ParsedPackage[]): Promise<ParsedPackage[]> {
    if (currentArchVersions.length === 0) {
      Logger.error("No packages found in databases", "RepoManager");
      return;
    }

    // We are only interested in the base packages
    currentArchVersions.filter((pkg) => {
      return pkg.base === pkg.name;
    });

    const result: ParsedPackage[] = [];

    Logger.log("Started determining changed packages...", "RepoManager");
    for (const pkg of currentArchVersions) {
      const archPkg: ArchlinuxPackage = await archPkgExists(pkg, this.dbConnections.archPkg);

      if (archPkg.version && archPkg.version === pkg.version) {
        continue;
      }
      archPkg.previousVersion = archPkg.version;
      archPkg.lastUpdated = new Date().toISOString();
      archPkg.version = pkg.version;
      archPkg.arch = ARCH;
      archPkg.pkgrel = pkg.pkgrel;
      void this.dbConnections.archPkg.save(archPkg);
      result.push(pkg);
    }

    Logger.log(`Done determining changed packages, in total ${result.length} packages changed`, "RepoManager");

    return result;
  }

  /**
   * Get all directories in a given path, filtering out files.
   * @param srcPath The path to get the directories from
   * @returns An array of directories
   */
  getDirectories(srcPath: string): string[] {
    return fs.readdirSync(srcPath).filter((file) => {
      return fs.statSync(path.join(srcPath, file)).isDirectory();
    });
  }

  /**
   * Parse the desc file of a package and return the relevant information.
   * @param descFile The path to the desc file
   * @returns The parsed package information as an ParsePackage object
   */
  parsePackageDesc(descFile: string): ParsedPackage {
    const fileData = fs.readFileSync(descFile);
    const lines = fileData.toString();
    const pkgbaseWithVersions: ParsedPackage = this.extractBaseAndVersion(lines);

    Logger.debug(
      `Parsed package ${pkgbaseWithVersions.base}, ${pkgbaseWithVersions.version}-${pkgbaseWithVersions.pkgrel}`,
      "RepoManager"
    );

    return pkgbaseWithVersions;
  }

  /**
   * Extract the base and version from a desc file string.
   * @param lines The lines of the desc file
   * @returns The parsed package information as an ParsePackage object
   */
  extractBaseAndVersion(lines: string): ParsedPackage {
    const completeVersion: string = lines.match(/(?<=%VERSION%\n)\S+/)[0];
    const splitVersion: string[] = completeVersion.split("-");

    return {
      base: lines.match(/(?<=%BASE%\n)\S+/)[0],
      version: completeVersion.split("-")[0],
      pkgrel: Number(completeVersion.split("-")[splitVersion.length - 1]),
      name: lines.match(/(?<=%NAME%\n)\S+/)[0]
    };
  }

  /**
   * Commits any changed PKGBUILD folders and Pushes the changes to the repository.
   * @param repoDir The directory of the repository
   * @param needsRebuild The array of packages that need to be rebuilt
   * @param repo The repository object
   * @private
   */
  private async pushChanges(repoDir: string, needsRebuild: { configObj: any; pkg: ParsedPackage }[], repo: Repo) {
    Logger.log("Committing changes and pushing back to repo...", "RepoManager");
    for (const rebuildPackage of needsRebuild) {
      try {
        const repoPkg = rebuildPackage.configObj.pkg as Package;
        await git.add({ fs, dir: repoDir, filepath: path.join(repoPkg.pkgname, ".CI", "config") });
        await git.commit({
          fs,
          dir: repoDir,
          author: { name: this.repoManagerSettings.gitAuthor, email: this.repoManagerSettings.gitEmail },
          message: `chore(${repoPkg.pkgname}): ${rebuildPackage.pkg.base} update -> increased pkgrel`
        });
      } catch (err: unknown) {
        Logger.error(err, "RepoManager");
      }
    }

    try {
      const pushResult: PushResult = await git.push({
        fs,
        http,
        dir: repoDir,
        onAuth: () => ({
          username: this.repoManagerSettings.gitUsername,
          password: this.repoManagerSettings.gitlabToken
        })
      });

      if (!pushResult.ok) {
        Logger.error("Failed to push changes, trying to recover...", "RepoManager");
        await git.fastForward({ fs, http, dir: repoDir, ref: "main", singleBranch: true });
        const pushResult = await git.push({
          fs,
          http,
          dir: repoDir,
          ref: "main",
          onAuth: () => ({
            username: this.repoManagerSettings.gitUsername,
            password: this.repoManagerSettings.gitlabToken
          })
        });
        if (!pushResult.ok) {
          throw new Error("Failed pushing");
        }
      } else {
        Logger.log(`Pushed changes to ${repo.name}`, "RepoManager");
      }
    } catch (err: unknown) {
      Logger.error(err, "RepoManager");
    }
  }

  /**
   * Clean up the directories after the repo has been cloned and the packages have been checked.
   * @param dirs The directories to clean up
   */
  cleanUp(dirs: string[]): void {
    try {
      for (const dir of dirs) {
        fs.rmSync(dir, { recursive: true });
      }
    } catch (err: unknown) {
    }
  }

  /**
   * Summarize the changes of the run.
   */
  summarizeChanges(alreadyBumped: Map<string, string>): void {
    Logger.log("Summarizing changes:", "RepoManager");
    Logger.log(`In total, ${alreadyBumped.size} package(s) got bumped`, "RepoManager");
    if (this.changedArchPackages.length === 0) {
      Logger.log("No packages changed in Arch repos", "RepoManager");
      return;
    } else {
      Logger.log(`In total, ${this.changedArchPackages.length} package(s) changed in Arch repos`, "RepoManager");
    }

    for (const [pkgname, base] of alreadyBumped.entries()) {
      Logger.log(`Bumped ${pkgname} due to ${base}`, "RepoManager");
    }
  }
}
