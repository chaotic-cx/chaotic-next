export type BuildClass = string | number;

export interface MoleculerEmitObject {
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
