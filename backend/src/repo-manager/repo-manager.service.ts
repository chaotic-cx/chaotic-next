import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import path from "node:path";
import * as fs from "node:fs";
import http from "isomorphic-git/http/node";
import git from "isomorphic-git";
import { ParsedPackage, RepoPackage, RepoStatus } from "../interfaces/repo-manager";
import { ArchlinuxPackage, archPkgExists, RepoManagerSettings, RepoManRepo } from "./repo-manager.entity";
import * as os from "node:os";
import * as tar from "tar";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ARCH } from "../constants";
import { Package, pkgnameExists, Repo } from "../builder/builder.entity";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class RepoManagerService {
    private repoManager: RepoManager;
    private archlinuxDb: Repository<ArchlinuxPackage>;
    private repo: Repository<RepoManRepo>;
    private settings: Repository<RepoManagerSettings>;

    constructor(
        private configService: ConfigService,
        private httpService: HttpService,
        @InjectRepository(ArchlinuxPackage)
        private archlinuxPackageRepository: Repository<ArchlinuxPackage>,
        @InjectRepository(RepoManRepo)
        private repoRepository: Repository<RepoManRepo>,
        @InjectRepository(RepoManagerSettings)
        private settingsRepository: Repository<RepoManagerSettings>,
        @InjectRepository(Package)
        private packageRepository: Repository<Package>,
    ) {
        this.repoManager = new RepoManager(
            this.httpService,
            {
                archPkg: archlinuxPackageRepository,
                settings: settingsRepository,
                repo: repoRepository,
                packages: packageRepository,
            },
            this.configService.getOrThrow<string>("repoMan.gitlabToken"),
        );
        this.archlinuxDb = archlinuxPackageRepository;
        this.repo = repoRepository;
        this.settings = settingsRepository;
        Logger.log("RepoManager service initialized", "RepoManager");
    }

    test() {
        this.repoManager.cloneRepo({
            name: "chaotic-aur",
            url: "https://gitlab.com/chaotic-aur/pkgbuilds.git",
            id: 1,
            status: 0,
        });
    }
}

class RepoManager {
    status: RepoStatus = RepoStatus.INACTIVE;
    private readonly cloneDir: string = path.join(process.cwd(), "repos");
    private readonly httpService: HttpService;
    private readonly archlinuxRepos: string[] = ["core", "extra"];
    private readonly archlinuxRepoUrl = (name: string) => `https://arch.mirror.constant.com/${name}/os/x86_64/${name}.db.tar.gz`;
    private readonly dbConnections: {
        archPkg: Repository<ArchlinuxPackage>;
        packages: Repository<Package>;
        repo: Repository<any>;
        settings: Repository<RepoManagerSettings>;
    };
    private readonly gitlabToken: string;

    constructor(
        httpService: HttpService,
        dbConnections: {
            archPkg: Repository<ArchlinuxPackage>;
            settings: Repository<RepoManagerSettings>;
            repo: Repository<Repo>;
            packages: Repository<Package>;
        },
        gitlabToken: string,
    ) {
        this.httpService = httpService;
        this.dbConnections = dbConnections;
        this.gitlabToken = gitlabToken;
        Logger.log("RepoManager initialized", "RepoManager");
    }

    async cloneRepo(repo: Repo): Promise<void> {
        this.status = RepoStatus.ACTIVE;
        Logger.log(`Started cloning repo ${repo.name}`, "RepoManager");

        const repoDir = path.join(this.cloneDir, repo.name);
        try {
            if (!fs.existsSync(this.cloneDir)) {
                if (!isValidUrl(repo.repoUrl)) {
                    throw new Error("Invalid URL");
                }

                Logger.debug("Creating repos directory", "RepoManager");
                await git.clone({
                    fs,
                    http,
                    dir: repoDir,
                    url: repo.repoUrl,
                    ref: "main", // repo.gitRef ? repo.gitRef : "main",
                    singleBranch: true,
                });
            } else {
                Logger.debug("Repo already exists, pulling changes", "RepoManager");
                await git.fastForward({
                    fs,
                    http,
                    dir: repoDir
                });
            }
        } catch (err: unknown) {
            Logger.error(err, "RepoManager");
            throw new Error(err as string);
        }

        Logger.debug(`Done cloning ${repo.name}`, "RepoManager");

        const changedArchPkg: ParsedPackage[] = await this.pullArchlinuxPackages();

        const pkgbaseDirs = this.getDirectories(repoDir);

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
                        Logger.debug(`Removing rebuild triggers for ${pkgbaseDir} from database.`, "RepoManager");
                        pkgInDb.bumpTriggers = null;
                    }
                    continue;
                }

                const rebuildTriggers: string[] = configObj["CI_REBUILD_TRIGGERS"].split(":");
                Logger.log(`Found ${rebuildTriggers.length} rebuild triggers for ${pkgbaseDir}.`, "RepoManager");

                const rebuildPackages: ParsedPackage[] = changedArchPkg.filter((pkg) => {
                    return rebuildTriggers.includes(pkg.base);
                });

                for (const rebuildPackage of rebuildPackages) {
                    needsRebuild.push({ pkg: rebuildPackage, configObj });
                }

                Logger.log(`Found ${needsRebuild.length} packages to rebuild for ${repo.name}.`, "RepoManager");
            }
        }

        for (const rebuildPackage of needsRebuild) {
            if (alreadyBumped.has(rebuildPackage.configObj.pkg.pkgname)) {
                Logger.warn(
                    `Already bumped via ${alreadyBumped.get(rebuildPackage.configObj.pkg.pkgname)}`,
                    "RepoManager",
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
            Logger.debug(`Rebuilding ${repoPkg.pkgname} because of ${rebuildPackage.pkg.base}.`, "RepoManager");

            if (!repoPkg.bumpTriggers) {
                repoPkg.bumpTriggers = [{ pkgname: rebuildPackage.pkg.base, archVersion: rebuildPackage.pkg.version }];
            } else {
                if (!repoPkg.bumpTriggers.find((trigger) => trigger.pkgname === rebuildPackage.pkg.base)) {
                    repoPkg.bumpTriggers.push({
                        pkgname: rebuildPackage.pkg.base,
                        archVersion: rebuildPackage.pkg.version,
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
                    flag: "a",
                });
            }
        }

        if (needsRebuild.length !== 0) return;

        await this.pushChanges(repoDir, needsRebuild);

        for (const rebuildPackage of needsRebuild) {
            const sendNow = rebuildPackage.configObj.pkg.bumpTriggers.find(
                (trigger: { pkgname: string; version: string }) => trigger.pkgname === rebuildPackage.pkg.base,
            );
        }
        Logger.log(`Pushed changes to ${repo.name}`, "RepoManager");

        Logger.debug("Done checking for rebuild triggers", "RepoManager");

        this.cleanUp([repoDir, ...pkgbaseDirs]);
    }

    async pullArchlinuxPackages(): Promise<ParsedPackage[]> {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "chaotic-"));
        Logger.log(`Started pulling Archlinux databases...`, "RepoManager");
        Logger.debug(`Created temporary directory ${tempDir}`, "RepoManager");

        const downloads = await Promise.allSettled(
            this.archlinuxRepos.map((repo) => {
                return new Promise<RepoPackage>(async (resolve, reject) => {
                    const repoUrl = this.archlinuxRepoUrl(repo);
                    const repoDir = path.join(tempDir, repo);
                    Logger.debug(`Pulling database of ${repo}...`, "RepoManager");
                    try {
                        const dbDownload = await this.httpService.axiosRef({
                            url: repoUrl,
                            method: "GET",
                            responseType: "arraybuffer",
                        });
                        const fileData = Buffer.from(dbDownload.data, "binary");
                        fs.mkdirSync(repoDir, { recursive: true });
                        fs.writeFileSync(path.join(repoDir, `${repo}.db.tar.gz`), fileData);

                        Logger.debug(`Done pulling database of ${repo}.`, "RepoManager");
                        resolve({ path: path.join(repoDir, `${repo}.db.tar.gz`), name: repo, workDir: repoDir });
                    } catch (err: unknown) {
                        Logger.error(err, "RepoManager");
                        reject(err);
                    }
                });
            }),
        );

        Logger.debug("Done pulling all databases.", "RepoManager");
        return await this.parseArchlinuxDatabase(
            downloads.map((download) => (download.status === "fulfilled" ? download.value : null)),
        );
    }

    async parseArchlinuxDatabase(databases: RepoPackage[]): Promise<ParsedPackage[]> {
        Logger.log("Started extracting databases...", "RepoManager");
        const workDirsPromises = await Promise.allSettled(
            databases.map((repo) => {
                return new Promise<RepoPackage>((resolve, reject) => {
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
            }),
        );
        Logger.log("Done extracting databases.", "RepoManager");

        const currentArchVersions: ParsedPackage[] = [];
        const actualWorkDirs = workDirsPromises.map((workDir) =>
            workDir.status === "fulfilled" ? workDir.value : null,
        );

        Logger.log("Started parsing databases...", "RepoManager");
        for (const dir of actualWorkDirs) {
            const currentPathRegex = `/${dir.path}/`;
            const allPkgDirs = this.getDirectories(dir.path);
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

    async determineChangedPackages(currentArchVersions: ParsedPackage[]): Promise<ParsedPackage[]> {
        if (currentArchVersions.length === 0) {
            Logger.error("No packages found in databases", "RepoManager");
            return;
        }
        currentArchVersions.filter((pkg) => {
            return pkg.base === pkg.name;
        });

        const result: ParsedPackage[] = [];

        Logger.log("Started determining changed packages...", "RepoManager");
        for (const pkg of currentArchVersions) {
            const archPkg = await archPkgExists(pkg, this.dbConnections.archPkg);

            if (archPkg.version && archPkg.version === pkg.version) {
                continue;
            }
            archPkg.previousVersion = archPkg.version;
            archPkg.lastUpdated = new Date().toISOString();
            archPkg.version = pkg.version;
            archPkg.arch = ARCH;
            this.dbConnections.archPkg.save(archPkg);
            result.push(pkg);
        }

        Logger.log(`Done determining changed packages, in total ${result.length} packages changed.`, "RepoManager");

        return result;
    }

    getDirectories(srcPath: string): string[] {
        return fs.readdirSync(srcPath).filter((file) => {
            return fs.statSync(path.join(srcPath, file)).isDirectory();
        });
    }

    parsePackageDesc(descFile: string): ParsedPackage {
        const fileData = fs.readFileSync(descFile);
        const lines = fileData.toString();

        const pkgbaseWithVersions: ParsedPackage = this.extractBaseAndVersion(lines);

        Logger.debug(
            `Parsed package ${pkgbaseWithVersions.base}, ${pkgbaseWithVersions.version}-${pkgbaseWithVersions.pkgrel}`,
            "RepoManager",
        );

        return pkgbaseWithVersions;
    }

    extractBaseAndVersion(lines: string): ParsedPackage {
        const completeVersion = lines.match(/(?<=%VERSION%\n)\S+/)[0];

        const splitVersion = completeVersion.split("-");

        return {
            base: lines.match(/(?<=%BASE%\n)\S+/)[0],
            version: completeVersion.split("-")[0],
            pkgrel: Number(completeVersion.split("-")[splitVersion.length - 1]),
            name: lines.match(/(?<=%NAME%\n)\S+/)[0],
        };
    }

    determineBumpEnabledPackages(options: any): any {}

    private async pushChanges(repoDir: string, needsRebuild: { configObj: any; pkg: ParsedPackage }[]) {
        for (const rebuildPackage of needsRebuild) {
            const repoPkg = rebuildPackage.configObj.pkg as Package;
            await git.add({ fs, dir: repoDir, filepath: path.join(repoPkg.pkgname, ".CI", "config") });
            Logger.debug(`Added ${repoPkg.pkgname} to git`, "RepoManager");
            await git.commit({
                fs,
                dir: repoDir,
                author: { name: "Temeraire", email: "root@dr460nf1r3.org" },
                message: `chore(${repoPkg.pkgname}): bumping pkgrel because of ${rebuildPackage.pkg.base}`,
            });
        }

        Logger.debug("Committed changes.", "RepoManager");

        Logger.debug(this.gitlabToken, "RepoManager");
        const pushResult = await git.push({
            fs,
            http,
            dir: repoDir,
            ref: "main",
            onAuth: () => ({ username: "dr460nf1r3", password: this.gitlabToken }),
        });

        if (!pushResult.ok) {
            Logger.error("Failed to push changes, trying to recover...", "RepoManager");
            await git.fastForward({ fs, http, dir: repoDir, ref: "main", singleBranch: true });
            const pushResult = await git.push({
                fs,
                http,
                dir: repoDir,
                ref: "main",
                onAuth: () => ({ username: "dr460nf1r3", password: this.gitlabToken }),
            });
            if (!pushResult.ok) {
                throw new Error("Failed pushing.")
            }
        } else {
            Logger.debug("Pushed changes to remote.", "RepoManager");
        }
    }

    cleanUp(dirs: string[]): void {
        for (const dir of dirs) {
            fs.rmSync(dir, { recursive: true });
        }
    }
}

function isValidUrl(url: string): boolean {
    try {
        new URL(url);
        return true;
    } catch (err: unknown) {
        return false;
    }
}

