export interface metricsObject {
    builder_queue: {
        completed: number
        failed: number
    }
    database_queue: {
        completed: number
        failed: number
    }
}

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

export const CAUR_BACKEND_URL: string = "https://builds.garudalinux.org/backend"
export const CAUR_METRICS_URL: string = `${CAUR_BACKEND_URL}/metrics/`
export const CAUR_API_URL: string = "https://builds.garudalinux.org/api/"
export const CAUR_MAP_URL: string = "https://status.chaotic.cx/map"
export const CAUR_HOME_URL: string = "https://caur-frontend.pages.dev/"
export const CAUR_PRIMARY_KEY: string = "3056513887B78AEB"
export const CAUR_TG_API_URL: string = `${CAUR_BACKEND_URL}/telegram/`

export interface TeamMember {
    name: string
    github: string
    avatarUrl?: string
    role?: string
    occupation?: string
}
export type TeamList = TeamMember[]

export interface TgMessage {
    date: number
    content: string
    author: string
    view_count: number
    link: string
}
export type TgMessageList = TgMessage[]

export interface Deployment {
    date: string
    name: string
    repo: string
}
export type DeploymentList = Deployment[]
