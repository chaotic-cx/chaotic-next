import { Build, Builder, Repo } from "./builder/builder.entity";
import { Repository } from "typeorm";

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
    repo: Repository<Repo>;
}
