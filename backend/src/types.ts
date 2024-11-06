import type { Repository } from "typeorm";
import type { Build, Builder, Package, Repo } from "./builder/builder.entity";

export type BuildClass = string | number;

export interface MoleculerBuildObject {
    arch: string;
    build_class: BuildClass;
    builder_name: string;
    commit?: string;
    duration?: number;
    logUrl?: string;
    pkgname: string;
    replaced: boolean;
    status?: BuildStatus;
    target_repo: string;
    timestamp: number;
    namcapAnalysis?: string;
}

export enum BuildStatus {
    SUCCESS = 0,
    ALREADY_BUILT = 1,
    SKIPPED = 2,
    FAILED = 3,
    TIMED_OUT = 4,
    CANCELED = 5,
    CANCELED_REQUEUE = 6,
    SOFTWARE_FAILURE = 7,
}

export interface BuilderDbConnections {
    build: Repository<Build>;
    builder: Repository<Builder>;
    package: Repository<Package>;
    repo: Repository<Repo>;
}

export interface RouterHitBody {
    arch: string;
    country: string;
    hostname: string;
    ip: string;
    package: string;
    pkgrel: string;
    repo: string;
    repo_arch: string;
    timestamp: string;
    user_agent: string;
    version: string;
}

export interface User {
    username: string;
    mail: string;
    password: string;
    role: UserRole;
}
export type Users = User[];

export enum UserRole {
    ROOT = 0,
    READ = 1,
}

export interface LoginCredentials {
    username: string;
    password: string;
}

export type JsonValue = string | number | boolean;

export interface JsonObject {
    [k: string]: JsonValue | JsonValue[] | JsonObject;
}
