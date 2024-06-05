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

export interface SpecificPackageMetrics {
    name?: string;
    downloads: number;
    user_agents: UserAgentList;
}

export interface CountNameObject {
    name: string;
    count: number;
}
export type CountryRankList = CountNameObject[];
export type PackageRankList = CountNameObject[];

export interface UserAgentMetric {
    name: string;
    count: number;
}
export type UserAgentList = UserAgentMetric[];

export const CAUR_METRICS_URL: string = "https://metrics.chaotic.cx/";
export const CAUR_API_URL: string = "https://builds.garudalinux.org/api/";
export const CAUR_MAP_URL: string = "https://status.chaotic.cx/map";
