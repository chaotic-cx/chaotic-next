export interface metricsObject {
    builder_queue: {
        completed: number;
        failed: number;
    };
    database_queue: {
        completed: number;
        failed: number;
    };
}

export type StatsObject = Record<
    string,
    {
        count: number;
        packages: (string | undefined)[];
    }
>[];

export type PackagesObject = Record<
    string,
    {
        arch: string;
        srcrepo: string;
        timestamp: string;
        repo_files: string;
    }
>[];

export interface QueueStatus {
    status: string;
    count: number;
    packages: (string | undefined)[];
}
export type CurrentQueue = QueueStatus[];

export interface CurrentPackage {
    name: string;
    arch: string;
    srcrepo: string;
    time: string;
    repo_files: string;
}
export type CurrentPackages = CurrentPackage[];
