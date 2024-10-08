import { MessageContent } from "./tdlib-types";

export const CACHE_ROUTER_TTL = 60 * 5 * 1000;
export const CACHE_TELEGRAM_TTL = 120 * 1000;
export const CAUR_ALLOWED_CORS = ["https://aur.chaotic.cx", "https://caur-frontend-pages.dev"];
export const CAUR_API_URL = "https://builds.garudalinux.org/api/";
export const CAUR_BACKEND_PORT = 3000;
export const CAUR_BACKEND_URL = "https://builds.garudalinux.org/backend/";
export const CAUR_CACHED_METRICS_URL = `${CAUR_BACKEND_URL}/metrics/`;
export const CAUR_DEPLOY_LOG_ID = "-1002151616973";
export const CAUR_HOME_URL = "https://aur.chaotic.cx/";
export const CAUR_LOGS_URL = "https://builds.garudalinux.org/logs/logs.html";
export const CAUR_MAP_URL = "https://status.chaotic.cx/map";
export const CAUR_METRICS_URL = "https://metrics.chaotic.cx/";
export const CAUR_NEWS_ID = "-1001293714071";
export const CAUR_PKG_LIST_URL = "https://builds.garudalinux.org/repos/chaotic-aur/pkgs.files.txt";
export const CAUR_PKG_URL = "https://cdn-mirror.chaotic.cx/chaotic-aur/x86_64/";
export const CAUR_PRIMARY_KEY = "3056513887B78AEB";
export const CAUR_REPO_API_URL = "https://gitlab.com/api/v4/projects/54867625/";
export const CAUR_REPO_URL = "https://gitlab.com/chaotic-aur/pkgbuilds/-/tree/main/";
export const CAUR_REPO_URL_GARUDA = "https://gitlab.com/garuda-linux/pkgbuilds/-/tree/main/";
export const CAUR_TG_API_URL = `${CAUR_BACKEND_URL}/telegram/`;

export type PackagesObject = Record<
    string,
    {
        arch: string;
        build_class: number;
        repo_files?: string;
        srcrepo: string;
        timestamp: number;
    }
>[];

export type StatsObject = {
    active: {
        count: number;
        packages: {
            liveLog?: string;
            name: string;
            node: string;
            build_class: number | null;
        }[];
    };
    waiting: {
        count: number;
        packages: { name: string; build_class: number }[];
    };
    idle: {
        count: number;
        nodes: { name: string; build_class: number }[];
    };
};

export interface QueueStatus {
    status: string;
    count: number;
    nodes?: string[] | { name: string; build_class: number }[];
    packages?: (string | undefined)[];
    build_class?: (number | null)[];
    liveLogUrl?: string[];
}

export type CurrentQueue = QueueStatus[];

export interface CurrentPackage {
    name: string;
    arch: string;
    srcrepo: string;
    time: string;
}

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

export interface TeamMember {
    name: string;
    github: string;
    avatarUrl?: string;
    role?: string;
    occupation?: string;
}

export type TeamList = TeamMember[];

export interface TgMessage {
    date: string;
    content: MessageContent[];
    author?: string;
    view_count?: number;
    link?: string;
    id: number;
    log?: string;
}

export type TgMessageList = TgMessage[];

export interface Deployment {
    sourceUrl?: string;
    date: string;
    name: string;
    node?: RegExpMatchArray | null | string;
    repo: string;
    type?: DeploymentType;
    string?: string;
    log?: string;
}

export type DeploymentList = Deployment[];

export enum DeploymentType {
    ALL = 0,
    SUCCESS = 1,
    FAILED = 2,
    TIMEOUT = 3,
    CLEANUP = 4,
}

export interface CountNameObject {
    name: string;
    count: number;
}

export interface UserAgentMetric {
    name: string;
    count: number;
}

export interface PkgListRetObject {
    pkglist: string;
}

export interface PkgListEntry {
    name: string;
    fullString: string;
}

export type PkgList = PkgListEntry[];

export interface GitLabPipeline {
    created_at: string;
    id: number;
    iid: number;
    name: string;
    project_id: number;
    ref: string;
    sha: string;
    source: string;
    status: string;
    updated_at: string;
    web_url: string;
}
