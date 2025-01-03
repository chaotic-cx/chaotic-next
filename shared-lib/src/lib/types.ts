import type { CommitStatusSchema, PipelineSchema } from '@gitbeaker/rest';

export const CACHE_ROUTER_TTL = 60 * 5 * 1000;
export const CAUR_ALLOWED_CORS = [
  'https://aur.chaotic.cx',
  'https://caur-frontend-pages.dev',
  'https://v2.caur-frontend.pages.dev',
];
export const CAUR_METRICS_URL = 'https://metrics.chaotic.cx/';

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

export const Repository = ['chaotic-aur', 'garuda', 'all'];

export interface Builder {
  id: number;
  name: string;
  description?: string;
  builderClass?: string;
  isActive?: boolean;
  lastActive?: Date;
}

export interface Package {
  id: number;
  pkgname: string;
  lastUpdated?: string;
  isActive: boolean;
  version?: string;
  bumpCount?: number;
  bumpTriggers?: { pkgname: string; archVersion: string }[];
  metadata?: ParsedPackageMetadata;
  pkgrel?: number;
  namcapAnalysis?: Partial<NamcapAnalysis>;
}

export interface Repo {
  id: number;
  name: string;
  repoUrl?: string;
  isActive: boolean;
  status?: RepoStatus;
  gitRef: string;
  dbPath?: string;
  apiToken?: string;
}

export interface Build {
  id: number;
  pkgbase: Package;
  buildClass?: string;
  builder?: Builder;
  repo?: Repo;
  status: BuildStatus;
  statusText: string;
  timestamp: Date;
  arch?: string;
  logUrl?: string;
  commit?: string;
  timeToEnd?: number;
  replaced?: boolean;
}

export type BuildClass = string | number;

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

export enum RepoStatus {
  ACTIVE = 0,
  INACTIVE = 1,
  RUNNING = 2,
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

export interface NamcapAnalysis {
  'dependency-detected-satisfied': string[];
  'dependency-implicitly-satisfied': string[];
  'depends-by-namcap-sight': string[];
  'libdepends-by-namcap-sight': string[];
  'libdepends-detected-not-included': string[];
  'libprovides-by-namcap-sight': string[];
  'library-no-package-associated': string[];
  'link-level-dependence': string[];
}

export interface PipelineWithExternalStatus {
  commit: CommitStatusSchema[];
  pipeline: PipelineSchema;
}

export interface Mirror {
  subdomain: string;
  latlon: [number, number];
  healthy: boolean;
  last_update: number;
  geo_active: boolean;
}

export interface MirrorSelf {
  addr: string;
  latlon: [number, number];
  geo: string;
}

export interface MirrorData {
  self: MirrorSelf;
  mirrors: Mirror[];
}
