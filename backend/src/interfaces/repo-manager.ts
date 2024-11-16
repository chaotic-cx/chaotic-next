import type { Package } from "../builder/builder.entity";
import type { ArchlinuxPackage } from "../repo-manager/repo-manager.entity";

export interface Repo {
    name: string;
    url: string;
    status: RepoStatus;
}

export enum RepoStatus {
    ACTIVE = 0,
    INACTIVE = 1,
    RUNNING = 2,
}

export interface RepoWorkDir {
    name: string;
    path: string;
    workDir: string;
}

export interface ParsedPackage {
    base: string;
    pkgrel: number;
    version: string;
    name: string;
    metaData: ParsedPackageMetadata;
}

export interface ParsedPackageMetadata {
    buildDate: string;
    checkDepends?: string[];
    conflicts?: string[];
    deps?: string[];
    desc?: string;
    filename: string;
    license?: string;
    makeDeps?: string[];
    optDeps?: string[];
    packager?: string;
    provides?: string[];
    replaces?: string[];
    soNameList?: string[];
    url?: string;
}

export interface RepoSettings {
    gitAuthor: string;
    gitEmail: string;
    gitUsername: string;
    globalBlacklist: string[];
    globalTriggers: string[];
    regenDatabase: boolean;
}

export interface RepoUpdateRunParams {
    archPkg: ArchlinuxPackage | Package;
    bumpType: BumpType;
    configs: CiConfigs;
    pkg: Package;
    triggerFrom: TriggerType;
}

export type CiConfigs = { [key: string]: string };

export interface BumpResult {
    bumped: PackageBumpEntry[];
    repo: string;
    origin: TriggerType;
}

export interface PackageConfig {
    configs: CiConfigs;
    pkgInDb: Package;
    rebuildTriggers: string[];
}

export interface PackageBumpEntry {
    pkg: Package;
    bumpType: BumpType;
    trigger: number;
    triggerName?: string;
    triggerFrom: TriggerType;
}

export enum BumpType {
    EXPLICIT = 0,
    GLOBAL = 1,
    FROM_DEPS = 2,
    FROM_DEPS_CHAOTIC = 3,
    NAMCAP = 4,
}

export enum TriggerType {
    ARCH = 0,
    CHAOTIC = 1,
}

export interface BumpLogEntry {
    bumpType: BumpType;
    pkgname: string;
    trigger: string;
    triggerFrom: TriggerType;
    timestamp: string;
}

export interface NamcapAnalysis {
    "dependency-detected-satisfied": string[];
    "dependency-implicitly-satisfied": string[];
    "depends-by-namcap-sight": string[];
    "libdepends-by-namcap-sight": string[];
    "libdepends-detected-not-included": string[];
    "libprovides-by-namcap-sight": string[];
    "library-no-package-associated": string[];
    "link-level-dependence": string[];
}
