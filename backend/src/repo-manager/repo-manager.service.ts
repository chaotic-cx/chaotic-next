import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import path from "node:path";
import * as fs from "node:fs";
import http from "isomorphic-git/http/node";
import git from "isomorphic-git";
import { ParsedPackage, RepoSettings, RepoStatus, RepoUpdateRunParams, RepoWorkDir } from "../interfaces/repo-manager";
import { ArchlinuxPackage, archPkgExists, RepoManagerSettings } from "./repo-manager.entity";
import * as os from "node:os";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Not, Repository } from "typeorm";
import { ARCH } from "../constants";
import { Package, pkgnameExists, Repo } from "../builder/builder.entity";
import { ConfigService } from "@nestjs/config";
import { AxiosResponse } from "axios";
import { isValidUrl } from "../functions";
import { CronJob } from "cron";
import util from "node:util";
import { exec } from "node:child_process";

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

    async updateChaoticVersions(): Promise<void> {
        let repoManager: RepoManager;
        if (!this.repoManager) {
            repoManager = this.createRepoManager();
        } else {
            repoManager = this.repoManager;
        }
        this.repos = await this.repoRepository.find({ where: { isActive: true, dbPath: Not(IsNull()) } });
        await repoManager.updateChaoticDatabaseVersions(this.repos);
    }

    async run() {
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

        Logger.log("Starting checking packages for needed rebuilds...", "RepoManager");
        await this.repoManager.pullArchlinuxPackages();

        if (!repoManager.changedArchPackages || repoManager.changedArchPackages.length === 0) {
            Logger.log("No packages changed in Arch repos, skipping run", "RepoManager");
            return;
        }

        const results: { bumped: Map<string, string>; repo: string }[] = [];
        for (const repo of this.repos) {
            const result = await repoManager.startRun(repo);
            results.push(result);
        }

        this.summarizeChanges(results, repoManager);
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

    /**
     * Summarize the changes of the run.
     */
    summarizeChanges(
        results: {
            bumped: Map<string, string>;
            repo: string;
        }[],
        repoManager: RepoManager,
    ): void {
        Logger.log("Summarizing changes:", "RepoManager");
        Logger.log(`In total, ${repoManager.changedArchPackages.length} Arch package(s) were changed`, "RepoManager");

        for (const result of results) {
            if (!result.bumped || result?.bumped?.size === 0) {
                Logger.log(`No packages affected in ${result.repo}`, "RepoManager");
                continue;
            }
            if (result.repo) {
                Logger.log(`Bumped packages in ${result.repo}:`, "RepoManager");
            }
            for (const [pkg, base] of result.bumped.entries()) {
                Logger.log(` - ${pkg} bumped via ${base}`, "RepoManager");
            }
        }
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
    async startRun(repo: Repo): Promise<{ bumped: Map<string, string>; repo: string }> {
        Logger.log(`Checking repo ${repo.name} for rebuild triggers...`, "RepoManager");
        this.status = RepoStatus.ACTIVE;
        Logger.log(`Started cloning repo ${repo.name}`, "RepoManager");

        const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), repo.name));
        try {
            if (fs.existsSync(repoDir)) {
                if (!isValidUrl(repo.repoUrl)) {
                    Logger.error(`Invalid URL for ${repo.name}`, "RepoManager");
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
        Logger.log("Started checking for rebuild triggers...", "RepoManager");

        const pkgbaseDirs: string[] = this.getDirectories(repoDir);
        const needsRebuild: RepoUpdateRunParams[] = await this.checkRebuildTriggers(pkgbaseDirs, repoDir, repo);
        if (!needsRebuild || needsRebuild.length === 0) {
            Logger.log(`No packages need to be rebuilt in ${repo.name}`, "RepoManager");
            this.cleanUp([repoDir, ...pkgbaseDirs]);
            this.status = RepoStatus.INACTIVE;
            return { repo: repo.name, bumped: undefined };
        }

        // Now is a good time to check for updated Chaotic-AUR versions. To be triggered with each build success soon
        await this.updateChaoticDatabaseVersions([repo]);
        const bumpedPackages: Map<string, string> = await this.bumpPackages(needsRebuild, repoDir);

        Logger.log(`Pushing changes to ${repo.name}`, "RepoManager");
        await this.pushChanges(repoDir, needsRebuild, repo);

        Logger.log("Done checking for rebuild triggers, cleaning up", "RepoManager");
        this.cleanUp([repoDir, ...pkgbaseDirs]);
        this.status = RepoStatus.INACTIVE;

        return { repo: repo.name, bumped: bumpedPackages };
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
        repo: Repo
    ): Promise<RepoUpdateRunParams[]> {
        const needsRebuild: { archPkg: ParsedPackage; configs: any; pkg: Package }[] = [];

        for (const pkgbaseDir of pkgbaseDirs) {
            const configFile = path.join(repoDir, pkgbaseDir, ".CI", "config");
            if (fs.existsSync(configFile)) {
                const pkgInDb: Package = await pkgnameExists(pkgbaseDir, this.dbConnections.packages);
                const currentTriggersInDb: { pkgname: string; archVersion: string }[] = pkgInDb.bumpTriggers ?? [];
                const configText = fs.readFileSync(configFile, "utf8");
                const configLines = configText.split("\n");
                const configs = {};
                let rebuildTriggers: string[];

                for (const line of configLines) {
                    const [key, value] = line.split("=");
                    configs[key] = value;
                }

                try {
                    if (!configs["CI_REBUILD_TRIGGERS"]) {
                        if (currentTriggersInDb.length > 0) {
                            Logger.debug(`Removing rebuild triggers for ${pkgbaseDir} from database`, "RepoManager");
                            pkgInDb.bumpTriggers = null;
                        }
                        continue;
                    }
                    rebuildTriggers = configs["CI_REBUILD_TRIGGERS"].split(":");
                    Logger.log(`Found ${rebuildTriggers.length} rebuild triggers for ${pkgbaseDir}`, "RepoManager");
                } catch (err: unknown) {
                    Logger.error(err, "RepoManager");
                    continue;
                }

                const archRebuildPkg: ParsedPackage[] = this.changedArchPackages.filter((pkg) => {
                    return rebuildTriggers.includes(pkg.base);
                });

                if (archRebuildPkg.length === 0) {
                    Logger.log(`No packages to rebuild for ${pkgbaseDir}`, "RepoManager");
                    continue;
                }

                // One trigger is enough, no need to bump twice for the same package
                needsRebuild.push({ archPkg: archRebuildPkg[0], configs, pkg: pkgInDb });

                Logger.log(`Found ${needsRebuild.length} packages to rebuild in ${repo.name}`, "RepoManager");
            }
        }

        return needsRebuild;
    }

    /**
     * Bump the packages in the database.
     * @param needsRebuild The packages that need to be rebuilt
     * @param repoDir The directory of the repository
     * @returns A map of the packages that were bumped
     */
    private async bumpPackages(needsRebuild: RepoUpdateRunParams[], repoDir: string): Promise<Map<string, string>> {
        const alreadyBumped = new Map<string, string>();
        for (const param of needsRebuild) {
            Logger.log(`Checking if ${param.pkg.pkgname} was already bumped`, "RepoManager");

            if (alreadyBumped.has(param.pkg.pkgname)) {
                Logger.warn(
                    `Already bumped via ${alreadyBumped.get(param.pkg.pkgname)}, skipping ${param.pkg.pkgname}`,
                    "RepoManager"
                );
                continue;
            }

            Logger.log(param.configs["CI_PACKAGE_BUMP"], "RepoManager");

            if (param.configs["CI_PACKAGE_BUMP"]) {
                const [version, bumpCount] = param.configs["CI_PACKAGE_BUMP"].split("/");
                const newVer = `${param.pkg.version}-${param.pkg.pkgrel}`;

                if (bumpCount) {
                    const newBumpCount = Number(bumpCount) + 1;
                    param.configs["CI_PACKAGE_BUMP"] = `${newVer}/${newBumpCount}`;
                } else {
                    param.configs["CI_PACKAGE_BUMP"] = `${newVer}/1`;
                }
            } else {
                param.configs["CI_PACKAGE_BUMP"] = `${param.pkg.version}-${param.pkg.pkgrel}/1`;
            }

            Logger.log(`Rebuilding ${param.pkg.pkgname} because of changed ${param.archPkg.base}`, "RepoManager");
            alreadyBumped.set(param.pkg.pkgname, param.archPkg.base);

            if (!param.pkg.bumpTriggers) {
                param.pkg.bumpTriggers = [{ pkgname: param.archPkg.base, archVersion: param.pkg.version }];
            } else {
                if (!param.pkg.bumpTriggers.find((trigger) => trigger.pkgname === param.archPkg.base)) {
                    param.pkg.bumpTriggers.push({
                        pkgname: param.archPkg.base,
                        archVersion: param.archPkg.version
                    });
                } else {
                    param.pkg.bumpTriggers = param.pkg.bumpTriggers.map((trigger) => {
                        if (trigger.pkgname === param.archPkg.base) {
                            trigger.archVersion = param.archPkg.version;
                        }
                        return trigger;
                    });
                }
            }

            void this.dbConnections.packages.save(param.pkg);

            if (fs.existsSync(path.join(repoDir, param.pkg.pkgname, ".CI", "config"))) {
                fs.rmSync(path.join(repoDir, param.pkg.pkgname, ".CI", "config"));
            }
            for (const [key, value] of Object.entries(param.configs)) {
                if (key === "pkg" || (key || value) === undefined) continue;
                fs.writeFileSync(path.join(repoDir, param.pkg.pkgname, ".CI", "config"), `${key}=${value}\n`, {
                    flag: "a"
                });
            }
        }

        return alreadyBumped;
    }

    /**
     * Pull the Archlinux databases and fill the changedArchPackages array with the packages that have changed.
     */
    async pullArchlinuxPackages(): Promise<void> {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "chaotic-"));
        Logger.log(`Started pulling Archlinux databases...`, "RepoManager");
        Logger.debug(`Created temporary directory ${tempDir}`, "RepoManager");

        const downloads = await Promise.allSettled(
            this.archlinuxRepos.map(async (repo) => {
                const repoUrl = this.archlinuxRepoUrl(repo);
                const repoDir = path.join(tempDir, repo);
                Logger.debug(`Pulling database for ${repo}...`, "RepoManager");
                try {
                    return await this.pullDatabases(repoUrl, repoDir, repo, "tar.gz");
                } catch (err: unknown) {
                    Logger.error(err, "RepoManager");
                }
            })
        );

        Logger.debug("Done pulling all databases", "RepoManager");
        const currentArchVersions = await this.parsePacmanDatabases(
            downloads.map((download): RepoWorkDir => (download.status === "fulfilled" ? download.value : null)),
            "tar.gz"
        );
        this.changedArchPackages = await this.determineChangedPackages(currentArchVersions);
    }

    /**
     * Update the database with the versions of our packages and set any non-existing packages to inactive.
     */
    async updateChaoticDatabaseVersions(repos: Repo[]): Promise<void> {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "chaotic-"));
        Logger.log("Started pulling Chaotic databases...", "RepoManager");
        Logger.debug(`Created temporary directory ${tempDir}`, "RepoManager");

        const downloads = await Promise.allSettled(
            repos.map(async (repo) => {
                return await this.pullDatabases(repo.dbPath, tempDir, "chaotic-aur", "tar.zst");
            })
        );

        Logger.debug("Done pulling all Chaotic-AUR databases", "RepoManager");
        const workDirs = [];
        for (const download of downloads) {
            if (download.status === "fulfilled") {
                workDirs.push(download.value);
            }
        }
        const currentChaoticVersions = await this.parsePacmanDatabases(workDirs, "tar.zst");

        Logger.log("Updating Chaotic database versions...", "RepoManager");
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
                chaoticPkg.metadata = JSON.stringify(pkg.metaData);
                void this.dbConnections.packages.save(chaoticPkg);
            })
        );
        Logger.log("Finished updating Chaotic database versions", "RepoManager");

        // Lastly, set any non-existing packages to inactive. The database can contain inactive
        // packages that are not in the Chaotic-AUR database anymore.
        Logger.log("Setting non-existing packages to inactive...", "RepoManager");
        const allChaoticVersionsInDb: Package[] = await this.dbConnections.packages.find({});
        for (const pkg of allChaoticVersionsInDb) {
            if (!currentChaoticVersions.find((chaoticPkg) => chaoticPkg.name === pkg.pkgname)) {
                pkg.isActive = false;
                void this.dbConnections.packages.save(pkg);
            }
        }
        Logger.log("Finished setting non-existing packages to inactive", "RepoManager");
    }

    /**
     * Pull repository databases and return necessary information.
     * @param dbUrl The URL of the database
     * @param repoDir The directory of the repository
     * @param repo The repository object
     * @param dbType The archive type of the database
     * @returns An object containing the path, name, and workDir of the repository
     */
    async pullDatabases(dbUrl: string, repoDir: string, repo: any, dbType: "tar.gz" | "tar.zst"): Promise<RepoWorkDir> {
        const dbDownload: AxiosResponse = await this.httpService.axiosRef({
            url: dbUrl,
            method: "GET",
            responseType: "arraybuffer"
        });
        const fileData: Buffer = Buffer.from(dbDownload.data, "binary");
        fs.mkdirSync(repoDir, { recursive: true });

        if (dbType === "tar.zst") {
            fs.writeFileSync(path.join(repoDir, `${repo}.db.tar.zst`), fileData);
            Logger.debug(`Done pulling database of ${repo}`, "RepoManager");
            return { path: path.join(repoDir, `${repo}.db.tar.zst`), name: repo, workDir: repoDir };
        } else if (dbType === "tar.gz") {
            fs.writeFileSync(path.join(repoDir, `${repo}.db.tar.gz`), fileData);
            Logger.debug(`Done pulling database of ${repo}`, "RepoManager");
            return { path: path.join(repoDir, `${repo}.db.tar.gz`), name: repo, workDir: repoDir };
        }
    }

    /**
     * Parse the Archlinux databases and return the packages that are relevant for the repository.
     * @param databases The databases to parse as RepoWorkDir objects
     * @param dbType The archive type of the database
     * @returns An array of packages that have changed
     */
    private async parsePacmanDatabases(
        databases: RepoWorkDir[],
        dbType: "tar.gz" | "tar.zst"
    ): Promise<ParsedPackage[]> {
        Logger.log("Started extracting databases...", "RepoManager");
        const workDirsPromises: PromiseSettledResult<RepoWorkDir>[] = await Promise.allSettled(
            databases.map((repo): Promise<RepoWorkDir> => {
                return new Promise<RepoWorkDir>(async (resolve, reject) => {
                    try {
                        if (!repo.path) reject("Path is null");
                        let workDir: string;

                        if (dbType === "tar.zst") {
                            workDir = repo.path.replace(/\/[^\/]+\.db\.tar\.zst$/, "");
                        } else if (dbType === "tar.gz") {
                            workDir = repo.path.replace(/\/[^\/]+\.db\.tar\.gz$/, "");
                        }

                        Logger.debug(`Unpacking database ${repo.path}`, "RepoManager");
                        // Use native tar due to lack of support for tar.zst in node tar
                        const execPromising = util.promisify(exec);
                        const { stdout, stderr } = await execPromising(`tar -xf ${repo.path} -C ${workDir}`);

                        if (stderr) {
                            Logger.error(stderr, "RepoManager");
                            reject(stderr);
                        }
                        resolve({ path: workDir, name: repo.name, workDir });
                    } catch (err: unknown) {
                        Logger.error(err, "RepoManager");
                        reject(err);
                    }
                });
            })
        );
        Logger.log("Done extracting databases", "RepoManager");

        const currentPackageVersions: ParsedPackage[] = [];
        const actualWorkDirs: RepoWorkDir[] = workDirsPromises.map(
            (workDir): RepoWorkDir => (workDir.status === "fulfilled" ? workDir.value : null)
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
                currentPackageVersions.push(this.parsePackageDesc(file.descFile));
            }
        }

        Logger.log("Done parsing databases", "RepoManager");
        return currentPackageVersions;
    }

    /**
     * Determine which packages have changed and update the database accordingly.
     * @param currentArchVersions The current versions of the packages
     * @returns An array of packages that have changed
     */
    private async determineChangedPackages(currentArchVersions: ParsedPackage[]): Promise<ParsedPackage[]> {
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

        Logger.log(`Done determining changed packages, in total ${result.length} package(s) changed`, "RepoManager");

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
    private parsePackageDesc(descFile: string): ParsedPackage {
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
    private extractBaseAndVersion(lines: string): ParsedPackage {
        const completeVersion: string = lines.match(/(?<=%VERSION%\n)\S+/)[0];
        const splitVersion: string[] = completeVersion.split("-");
        const base = lines.match(/(?<=%BASE%\n)\S+/)[0];
        const buildDate = lines.match(/(?<=%BUILDDATE%\n)\S+/);
        const checkDepends = this.tryMatch("(?<=%CHECKDEPENDS%\\n)[\\s\\S]*?(?=\\n{2})", lines);
        const conflicts = this.tryMatch("(?<=%CONFLICTS%\\n)[\\s\\S]*?(?=\n{2})", lines);
        const deps = this.tryMatch("(?<=%DEPENDS%\\n)[\\s\\S]*?(?=\\n{2})", lines);
        const desc = lines.match(/(?<=%DESC%\n)[\s\S]*?(?=\n{2})/);
        const filename = lines.match(/(?<=%FILENAME%\n)\S+/);
        const license = lines.match(/(?<=%LICENSE%\n)\S+/);
        const makeDeps = this.tryMatch("(?<=%MAKEDEPENDS%\\n)[\\s\\S]*?(?=\\n{2})", lines);
        const name = lines.match(/(?<=%NAME%\n)\S+/)[0];
        const optDeps = this.tryMatch("(?<=%OPTDEPENDS%\\n)[\\s\\S]*?(?=\\n{2})", lines);
        const packager = lines.match(/(?<=%PACKAGER%\n).+$/);
        const pkgrel = Number(completeVersion.split("-")[splitVersion.length - 1]);
        const provides = this.tryMatch("(?<=%PROVIDES%\\n)[\\s\\S]*?(?=\\n{2})", lines);
        const replaces = this.tryMatch("(?<=%REPLACES%\\n)[\\s\\S]*?(?=\\n{2})", lines);
        const url = lines.match(/(?<=%URL%\n)\S+/);
        const version = completeVersion.split("-")[0];

        return {
            base,
            version,
            pkgrel,
            name,
            metaData: {
                buildDate: buildDate ? buildDate[0] : undefined,
                checkDepends: checkDepends ? checkDepends.split("\n") : undefined,
                conflicts: conflicts ? conflicts.split("\n") : undefined,
                deps: deps ? deps.split("\n") : undefined,
                license: license ? license[0] : undefined,
                filename: filename ? filename[0] : undefined,
                makeDeps: makeDeps ? makeDeps.split("\n") : undefined,
                optDeps: optDeps ? optDeps.split("\n") : undefined,
                packager: packager ? packager[0] : undefined,
                desc: desc ? desc[0] : undefined,
                provides: provides ? provides.split("\n") : undefined,
                replaces: replaces ? replaces.split("\n") : undefined,
                url: url ? url[0] : undefined
            }
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
    private async pushChanges(
        repoDir: string,
        needsRebuild: {
            configs: any;
            archPkg: ParsedPackage;
            pkg: Package;
        }[],
        repo: Repo
    ) {
        Logger.log("Committing changes and pushing back to repo...", "RepoManager");
        for (const param of needsRebuild) {
            try {
                await git.add({ fs, dir: repoDir, filepath: path.join(param.pkg.pkgname, ".CI", "config") });
                await git.commit({
                    fs,
                    dir: repoDir,
                    author: { name: this.repoManagerSettings.gitAuthor, email: this.repoManagerSettings.gitEmail },
                    message: `chore(${param.pkg.pkgname}): ${param.archPkg.base} update -> increased pkgrel`
                });
            } catch (err: unknown) {
                Logger.error(err, "RepoManager");
            }
        }

        try {
            await git.push({
                fs,
                http,
                dir: repoDir,
                onAuth: () => ({
                    username: this.repoManagerSettings.gitUsername,
                    password: this.repoManagerSettings.gitlabToken
                })
            });

            Logger.log(`Pushed changes to ${repo.name}`, "RepoManager");
        } catch (err: unknown) {
            Logger.error(err, "RepoManager");
        }
    }

    /**
     * Clean up the directories after the repo has been cloned and the packages have been checked.
     * @param dirs The directories to clean up
     */
    private cleanUp(dirs: string[]): void {
        try {
            for (const dir of dirs) {
                fs.rmSync(dir, { recursive: true });
            }
        } catch (err: unknown) {
        }
    }
}
