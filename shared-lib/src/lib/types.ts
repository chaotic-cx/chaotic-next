import { MessageContent } from "./tdlib-types"

export const CACHE_ROUTER_TTL = 60 * 5 * 1000
export const CACHE_TELEGRAM_TTL = 30 * 1000
export const CAUR_ALLOWED_CORS = ["https://aur.chaotic.cx", "https://caur-frontend-pages.dev"]
export const CAUR_API_URL = "https://builds.garudalinux.org/api/"
export const CAUR_BACKEND_PORT = 3000
export const CAUR_BACKEND_URL = "https://builds.garudalinux.org/backend"
export const CAUR_CACHED_METRICS_URL = `${CAUR_BACKEND_URL}/metrics/`
export const CAUR_DEPLOY_LOG_ID = "-1002151616973"
export const CAUR_HOME_URL = "https://aur.chaotic.cx/"
export const CAUR_MAP_URL = "https://status.chaotic.cx/map"
export const CAUR_METRICS_URL = "https://metrics.chaotic.cx/"
export const CAUR_NEWS_ID = "-1001293714071"
export const CAUR_PKG_LIST_URL = "https://builds.garudalinux.org/chaotic-v4/pkgs.files.txt"
export const CAUR_PRIMARY_KEY = "3056513887B78AEB"
export const CAUR_TG_API_URL = `${CAUR_BACKEND_URL}/telegram/`

export type StatsObject = Record<
    string,
    {
        count: number
        packages: (string | undefined)[]
    }
>[]

export type PackagesObject = Record<
    string,
    {
        arch: string
        srcrepo: string
        timestamp: string
        repo_files: string
    }
>[]

export interface QueueStatus {
    status: string
    count: number
    packages: (string | undefined)[]
}

export type CurrentQueue = QueueStatus[]

export interface CurrentPackage {
    name: string
    arch: string
    srcrepo: string
    time: string
}

export type CurrentPackages = CurrentPackage[]

export interface SpecificPackageMetrics {
    name?: string
    downloads: number
    user_agents: UserAgentList
}

export interface CountNameObject {
    name: string
    count: number
}

export type CountryRankList = CountNameObject[]
export type PackageRankList = CountNameObject[]

export interface UserAgentMetric {
    name: string
    count: number
}

export type UserAgentList = UserAgentMetric[]

export interface TeamMember {
    name: string
    github: string
    avatarUrl?: string
    role?: string
    occupation?: string
}

export type TeamList = TeamMember[]

export interface TgMessage {
    date: string
    content: MessageContent[]
    author?: string
    view_count?: number
    link?: string
    id: number
    log?: string
}

export type TgMessageList = TgMessage[]

export interface Deployment {
    date: string
    name: string
    repo: string
    type?: DeploymentType
    string?: string
    log?: string
}

export type DeploymentList = Deployment[]

export enum DeploymentType {
    ALL,
    SUCCESS,
    FAILED,
    TIMEOUT,
    CLEANUP,
}

export interface CountNameObject {
    name: string
    count: number
}

export interface UserAgentMetric {
    name: string
    count: number
}

export interface PkgListRetObject {
    pkglist: string
}
export interface PkgListEntry {
    name: string
    fullString: string
}
export type PkgList = PkgListEntry[]
