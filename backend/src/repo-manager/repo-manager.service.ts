import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import path from "node:path";
import * as fs from "node:fs";
import http from "isomorphic-git/http/node";
import git from "isomorphic-git";
import { ParsedPackage, RepoPackage, RepoStatus } from "../interfaces/repo-manager";
import { ArchlinuxPackage, archPkgExists, Repo, RepoManagerSettings, RepoManRepo } from "./repo-manager.entity";
import * as os from "node:os";
import * as tar from "tar";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ARCH } from "../constants";
import { Package, pkgnameExists } from "../builder/builder.entity";

@Injectable()
export class RepoManagerService {
    repoManager: RepoManager;
    archlinuxDb: Repository<ArchlinuxPackage>;
    repo: Repository<RepoManRepo>;
    settings: Repository<RepoManagerSettings>;

    constructor(
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
        this.repoManager = new RepoManager(this.httpService, {
            archPkg: archlinuxPackageRepository,
            settings: settingsRepository,
            repo: repoRepository,
            packages: packageRepository,
        });
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
    repoList: Repo[] = [];
    status: RepoStatus = RepoStatus.INACTIVE;
    cloneDir: string = path.join(process.cwd(), "repos");
    httpService: HttpService;
    archlinuxRepos: string[] = ["core"];
    archlinuxRepoUrl = (name: string) => `https://arch.mirror.constant.com/${name}/os/x86_64/${name}.db.tar.gz`;
    dbConnections: any;

    constructor(
        httpService: HttpService,
        dbConnections: {
            archPkg: Repository<ArchlinuxPackage>;
            settings: Repository<RepoManagerSettings>;
            repo: Repository<Repo>;
            packages: Repository<Package>;
        },
    ) {
        this.httpService = httpService;
        this.dbConnections = dbConnections;
        Logger.log("RepoManager initialized", "RepoManager");
    }

    async cloneRepo(repo: Repo): Promise<void> {
        this.status = RepoStatus.ACTIVE;
        repo.status = RepoStatus.ACTIVE;
        Logger.log(`Cloning repo ${repo.name}`, "RepoManager");

        const repoDir = path.join(this.cloneDir, repo.name);
        try {
            if (!fs.existsSync(this.cloneDir)) {
                Logger.debug("Creating repos directory", "RepoManager");
                await git.clone({
                    fs,
                    http,
                    dir: repoDir,
                    url: repo.url,
                    ref: repo.gitRef ? repo.gitRef : "main",
                    singleBranch: true,
                });
            } else {
                Logger.debug("Repo already exists, pulling changes", "RepoManager");
                await git.pull({
                    fs,
                    http,
                    dir: repoDir,
                    author: {
                        name: "Mr. Test",
                        email: "mrtest@example.com",
                    },
                });
            }
        } catch (err: unknown) {
            Logger.error(err, "RepoManager");
        }

        Logger.debug("Done cloning", "RepoManager");

        const changedArchPkg: ParsedPackage[] = await this.pullArchlinuxPackages();

        const pkgbaseDirs = this.getDirectories(repoDir);

        const needsRebuild: { pkg: ParsedPackage; configObj: any }[] = [];

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
                        Logger.debug(`Removing rebuild triggers for ${pkgbaseDir}`, "RepoManager");
                        pkgInDb.bumpTriggers = null;
                    }
                    continue;
                }
                Logger.debug(`Found rebuild triggers for ${pkgbaseDir}`, "RepoManager");

                const rebuildTriggers: string[] = configObj["CI_REBUILD_TRIGGERS"].split(":");
                const rebuildPackages: ParsedPackage[] = changedArchPkg.filter((pkg) => {
                    return rebuildTriggers.includes(pkg.base);
                });

                for (const rebuildPackage of rebuildPackages) {
                    needsRebuild.push({ pkg: rebuildPackage, configObj });
                }
            }
        }

        for (const rebuildPackage of needsRebuild) {
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
            Logger.debug(`Rebuilding ${repoPkg.pkgname}`, "RepoManager");

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

            this.dbConnections.packages.save(repoPkg);

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

        if (needsRebuild.length > 0) await this.pushChanges(repoDir, needsRebuild);

        Logger.debug("Done checking for rebuild triggers", "RepoManager");
    }

    async pullArchlinuxPackages(): Promise<ParsedPackage[]> {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "chaotic-"));
        Logger.debug(`Created temporary directory ${tempDir}`, "RepoManager");

        const downloads = await Promise.allSettled(
            this.archlinuxRepos.map((repo) => {
                return new Promise<RepoPackage>(async (resolve, reject) => {
                    const repoUrl = this.archlinuxRepoUrl(repo);
                    const repoDir = path.join(tempDir, repo);
                    Logger.debug(`Pulling database of ${repo}`, "RepoManager");
                    try {
                        const dbDownload = await this.httpService.axiosRef({
                            url: repoUrl,
                            method: "GET",
                            responseType: "arraybuffer",
                        });
                        const fileData = Buffer.from(dbDownload.data, "binary");
                        fs.mkdirSync(repoDir, { recursive: true });
                        fs.writeFileSync(path.join(repoDir, `${repo}.db.tar.gz`), fileData);

                        Logger.debug(`Downloaded ${repo} database`, "RepoManager");
                        resolve({ path: path.join(repoDir, `${repo}.db.tar.gz`), name: repo, workDir: repoDir });
                    } catch (err: unknown) {
                        Logger.error(err, "RepoManager");
                        reject(err);
                    }
                });
            }),
        );

        Logger.debug("Done pulling databases", "RepoManager");
        return await this.parseArchlinuxDatabase(
            downloads.map((download) => (download.status === "fulfilled" ? download.value : null)),
        );
    }

    async parseArchlinuxDatabase(databases: RepoPackage[]): Promise<ParsedPackage[]> {
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
        Logger.debug("Done extracting databases", "RepoManager");

        const currentArchVersions: ParsedPackage[] = [];
        const actualWorkDirs = workDirsPromises.map((workDir) =>
            workDir.status === "fulfilled" ? workDir.value : null,
        );
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

        Logger.debug("Done parsing databases", "RepoManager");
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
                author: { name: "Mr. Test", email: "test@test.test" },
                message: `chore(${repoPkg.pkgname}): bump pkgrel because of ${rebuildPackage.pkg.base}`,
            });
        }

        await git.push({ fs, http, dir: repoDir, ref: "main" });
    }
}
