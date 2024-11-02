import { Package } from "../builder/builder.entity";

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
    filename: string;
    license?: string;
    makeDeps?: string[];
    optDeps?: string[];
    packager?: string;
    desc?: string;
    provides?: string[];
    replaces?: string[];
    url?: string;
}

export interface RepoSettings {
    gitAuthor: string;
    gitEmail: string;
    gitUsername: string;
    gitlabToken: string;
    alwaysRebuild: string[];
}

export interface PkgnameVersion {
    pkgname: string;
    archVersion: string;
}

export interface RepoUpdateRunParams {
    archPkg: ParsedPackage;
    configs: CiConfigs;
    pkg: Package;
}

export type CiConfigs = { [key: string]: string };

export interface GlobalRebuildTriggerParams {
    bumpedDeps: ParsedPackage[];
    pkg: Package;
    deps: string[];
}

export interface GlobalRebuildTriggerBump {
    packages: RepoUpdateRunParams[];
    repoDir: string;
}

export interface BumpResult {
    bumped: Map<string, string>;
    repo: string;
}
