import { MergeRequestDiffSchema, MergeRequestSchema } from '@gitbeaker/core';
import type { PipelineSchema } from '@gitbeaker/rest';

export const CAUR_ALLOWED_CORS = [
  'https://aur.chaotic.cx',
  'https://caur-frontend-pages.dev',
  'https://v2.caur-frontend.pages.dev',
];

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
  createdAt?: string;
  isActive: boolean;
  skipSignalScan?: boolean;
  version?: string;
  bumpCount?: number;
  bumpTriggers?: { pkgname: string; archVersion: string }[];
  metadata?: ParsedPackageMetadata;
  pkgrel?: number;
  bump?: number;
  repo?: number;
  /** Repository name, resolved server-side when the repo relation is joined. */
  reponame?: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export type SortOrder = 'ASC' | 'DESC';

export const PACKAGE_SORT_FIELDS = ['id', 'pkgname', 'lastUpdated', 'createdAt', 'version', 'pkgrel', 'repo'] as const;
export type PackageSortField = (typeof PACKAGE_SORT_FIELDS)[number];

export const BUILD_SORT_FIELDS = ['id', 'timestamp', 'timeToEnd', 'status', 'pkgname', 'builder', 'repo'] as const;
export type BuildSortField = (typeof BUILD_SORT_FIELDS)[number];

export function isPackageSortField(value: string): value is PackageSortField {
  return (PACKAGE_SORT_FIELDS as readonly string[]).includes(value);
}

export function isBuildSortField(value: string): value is BuildSortField {
  return (BUILD_SORT_FIELDS as readonly string[]).includes(value);
}

export interface PackageElfAnalysis {
  version: string;
  /** e.g. "usr/lib/qt6/plugins/kwin/effects/plugins/better_blur_dx.so" */
  files: string[];
  /** DT_NEEDED sonames of every ELF object in the package. */
  neededSonames: string[];
  /** SONAME of every shipped .so file. */
  providedSonames: string[];
  /**
   * Dynamic symbols the package imports (undefined symbols of its shipped
   * ELF objects), deduplicated. Kept flat on purpose: attributing each symbol
   * to a specific linked library requires dynamic resolution; instead the bump
   * logic intersects this set with the owner's old/new exports per soname.
   */
  importedSymbols: string[];
  /**
   * Dynamic symbols each shipped .so exports, keyed by the .so's SONAME
   * (from nm -D --defined-only).
   */
  exportedSymbols: Record<string, string[]>;
  /**
   * Per-vtable layout of the exported virtual-slot lists, keyed by the mangled
   * vtable symbol (e.g. `_ZTVN4KWin6EffectE`) and valued by the ordered list of
   * slot-target symbols. Derived from `readelf -rW` + `nm -D -S --defined-only`.
   * A vtable whose layout drifts (reorder/mid-insertion/removal, not a pure
   * append) breaks every consumer that imports a shifted slot.
   */
  vtables: Record<string, string[]>;
  /** Parent directory of every shipped file. */
  directoriesOwned: string[];
  /**
   * The direct parent directories of the shipped files (real ownership). Used
   * to distinguish "this package installs files directly into an owner's dir"
   * from mere transitive ancestor ownership when detecting plugins.
   */
  directDirectories: string[];
  /**
   * Other packages this package is a plugin of: directories it installs files
   * into that another package owns (e.g. kwin's usr/lib/qt6/plugins/kwin/).
   */
  pluginOf: string[];
  /**
   * Whether the package is broken in the current repo state: it links a soname
   * nobody provides (dropped/renamed dependency) or ships files under a stale
   * python/perl/ruby/ghc version directory.
   */
  broken: boolean;
  /** Empty when not broken. */
  brokenReasons: string[];
  scannedAt: string;
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
  gitlabProjectId?: string;
}

export interface GitlabJob {
  id: number;
  name: string;
  stage: string;
  status: string;
  ref: string;
  webUrl: string;
  startedAt?: string;
  finishedAt?: string;
  duration?: number;
}

export interface GitlabLogChunk {
  offset: number;
  text: string;
  complete: boolean;
  status: string;
}

export interface MrAction {
  id: number;
  mergeRequestIid: number;
  commitSha: string | null;
  action: string;
  userId: string;
  userName: string;
  createdAt: string;
}

export enum PipelineOperation {
  NONE = 'none',
  BUMP_PACKAGES = 'bump-packages',
  SCHEDULE_PACKAGES = 'schedule-packages',
  RUN_SCHEDULE = 'run-schedule',
  DROP_PACKAGES = 'drop-packages',
  ADD_PACKAGES = 'add-packages',
}

export const PIPELINE_OPERATIONS: readonly PipelineOperation[] = [
  PipelineOperation.NONE,
  PipelineOperation.BUMP_PACKAGES,
  PipelineOperation.SCHEDULE_PACKAGES,
  PipelineOperation.RUN_SCHEDULE,
  PipelineOperation.DROP_PACKAGES,
  PipelineOperation.ADD_PACKAGES,
];

export const PKGBUILD_SOURCE_AUR = 'aur';

export const PIPELINE_REQUEST_REASONS = [
  'unset',
  'request',
  'depends',
  'depends:optional',
  'depends:make',
  'depends:check',
] as const;
export type PipelineRequestReason = (typeof PIPELINE_REQUEST_REASONS)[number];

// Regex constraints of the pipeline's spec:inputs section, shared by the
// backend validation and the frontend signal-forms validators.
export const PIPELINE_PACKAGES_REGEX = /^(?:[\w@.+/-]+(?::[\w@.+/-]+)*)?$/;
export const PIPELINE_ADD_PACKAGES_REGEX =
  /^([\w@.+/-]+\/(aur|(https?|git):\/\/\S+)(\s[\w@.+/-]+\/(aur|(https?|git):\/\/\S+))*)?$/;
export const PIPELINE_REF_REGEX = /^[\w@.+/-]{1,255}$/;
export const PIPELINE_PKG_BASE_REGEX = /^[\w@.+-]+$/;

/**
 * Inputs of the chaotic-aur pipeline, mirroring its `spec:inputs` section.
 * Which inputs are required depends on the chosen operation.
 */
export interface PipelineTriggerInputs {
  operation: PipelineOperation;
  ref?: string;
  packages?: string;
  trigger?: string;
  add_packages?: string;
  request_origin?: string;
  request_reason?: string;
  custom_request_reason?: string;
}

export interface PipelineTriggerResult {
  pipelineId: number;
  webUrl: string;
  status: string;
}

export interface PipelineScheduleOption {
  id: number;
  description: string | null;
  active: boolean;
}

export interface PipelineTriggerAction {
  id: number;
  ref: string;
  commitSha: string | null;
  operation: string;
  inputs: Record<string, string>;
  pipelineId?: number;
  webUrl?: string;
  userId: string;
  userName: string;
  createdAt: string;
}

export interface PackageBump {
  id: number;
  bumpType: number;
  trigger: number;
  triggerFrom: number;
  details?: string[];
  timestamp: string;
  pkgname?: string;
  triggerName?: string;
}
export type PkgType = '0' | '1';

export interface IndexResult {
  scanned: number;
  skipped: number;
  failed: number;
}

/**
 * One package flagged broken by the ELF signal scanner. Only Chaotic packages
 * are ever reported: Arch packages are reference data and never judged broken.
 */
export interface BrokenPackageReport {
  pkgType: 'chaotic';
  pkgname: string;
  version: string;
  repoName?: string;
  reasons: string[];
}

export interface RebuildTriggerSourcePackage {
  pkgname: string;
  pkgType: 'arch' | 'chaotic';
}

export interface SonameDependency {
  soname: string;
  providers: RebuildTriggerSourcePackage[];
}

export interface PackageRebuildTriggerSources {
  pkgname: string;
  /** Arch packages listed in the package's CI_REBUILD_TRIGGERS (read live from `.CI/config`). */
  explicitTriggers: { pkgname: string; archVersion: string }[];
  /** Sonames the package links and who provides them (a dropped provider triggers BROKEN_DEPS). */
  sonameDependencies: SonameDependency[];
  /** Owners this package is a plugin of; their ABI change triggers PLUGIN. */
  pluginOwners: RebuildTriggerSourcePackage[];
}

export interface AdminPackageElfAnalysis {
  id: number;
  pkgType: PkgType;
  pkgId: number;
  pkgname?: string;
  version: string;
  broken: boolean;
  brokenReasons: string[];
  scannedAt: string;
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

export function isBuildStatus(value: number): value is BuildStatus {
  return Object.values(BuildStatus).includes(value);
}

export const STATUS_LABELS: Record<BuildStatus, string> = {
  [BuildStatus.SUCCESS]: 'success',
  [BuildStatus.ALREADY_BUILT]: 'already-built',
  [BuildStatus.SKIPPED]: 'skipped',
  [BuildStatus.FAILED]: 'failure',
  [BuildStatus.TIMED_OUT]: 'timeout',
  [BuildStatus.CANCELED]: 'canceled',
  [BuildStatus.CANCELED_REQUEUE]: 'canceled-requeue',
  [BuildStatus.SOFTWARE_FAILURE]: 'software-failure',
};

export const STATUS_DISPLAY_NAMES: Record<BuildStatus, string> = {
  [BuildStatus.SUCCESS]: 'Success',
  [BuildStatus.ALREADY_BUILT]: 'Already Built',
  [BuildStatus.SKIPPED]: 'Skipped',
  [BuildStatus.FAILED]: 'Failed',
  [BuildStatus.TIMED_OUT]: 'Timed Out',
  [BuildStatus.CANCELED]: 'Canceled',
  [BuildStatus.CANCELED_REQUEUE]: 'Canceled Requeue',
  [BuildStatus.SOFTWARE_FAILURE]: 'Software Failure',
};

export enum RepoStatus {
  ACTIVE = 0,
  INACTIVE = 1,
  RUNNING = 2,
}

export interface ArchPackage {
  id: number;
  pkgname: string;
  version?: string;
  pkgrel?: number;
  arch?: string;
  lastUpdated?: string;
  previousVersion?: string | null;
  metadata?: ParsedPackageMetadata;
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

export interface ExternalCommitStatus {
  id: number;
  name: string;
  status: string;
  description: string | null;
  target_url: string | null;
  started_at: string | null;
  finished_at: string | null;
  pipeline_id: number;
}

export interface PipelineWithExternalStatus {
  commit: ExternalCommitStatus[];
  pipeline: PipelineSchema;
}

export type DiffScanSeverity = 'critical' | 'warning' | 'info';

export interface DiffScanFinding {
  ruleId: string;
  ruleName: string;
  severity: DiffScanSeverity;
  description: string;
  file: string;
  line?: number;
  match: string;
}

export type VtVerdict = 'malicious' | 'suspicious' | 'clean' | 'unknown';

export interface VtEngineStats {
  malicious: number;
  suspicious: number;
  undetected: number;
  harmless: number;
  timeout: number;
}

export function totalEngines(stats: VtEngineStats): number {
  return stats.malicious + stats.suspicious + stats.undetected + stats.harmless + stats.timeout;
}

export interface VtIndicatorReport {
  type: 'url' | 'file';
  value: string;
  context: string;
  verdict: VtVerdict;
  stats?: VtEngineStats;
}

export type AurScanStatus = 'scanning' | 'awaiting-vt' | 'done' | 'failed';

export interface AurMaintainerInfo {
  username: string;
  packagesMaintained: number;
  totalVotes: number;
  /** Submission date of the maintainer's oldest package; the closest available proxy for account age. */
  oldestFirstSubmitted: string;
  novice: boolean;
}

export interface AurMaintainerChange {
  previous: string[];
  added: string[];
  removed: string[];
  detectedAt: string;
}

export interface AurPackageMeta {
  votes: number;
  popularity: number;
  firstSubmitted: string;
  outOfDate: boolean;
  orphaned: boolean;
}

export interface AurPackageScan {
  packageName: string;
  packageBase: string;
  status: AurScanStatus;
  error?: string;
  sources: string[];
  scannedFiles: string[];
  findings: DiffScanFinding[];
  vtReports: VtIndicatorReport[];
  vtPending: number;
  maintainers: AurMaintainerInfo[];
  maintainerChange?: AurMaintainerChange;
  packageMeta: AurPackageMeta;
  sourceFiles?: { name: string; content: string }[];
  startedAt: string;
}

export interface AurScanStreamChunk {
  scan: AurPackageScan;
  complete: boolean;
}

export interface MrPackageInfo {
  pkgname: string;
  ciFiles: string[];
  pkgbuildSource: string;
  manageAur: boolean;
  rebuildTriggers: string[];
  nvchecker: boolean;
}

export type MergeRequestWithDiffs = Pick<
  MergeRequestSchema,
  | 'id'
  | 'iid'
  | 'title'
  | 'state'
  | 'web_url'
  | 'created_at'
  | 'updated_at'
  | 'assignees'
  | 'sha'
  | 'merge_status'
  | 'detailed_merge_status'
> & {
  diffs: MergeRequestDiffSchema[];
  labels: string[];
  scanFindings?: DiffScanFinding[];
  vtReports?: VtIndicatorReport[];
  maintainers?: AurMaintainerInfo[];
  maintainerChange?: AurMaintainerChange;
  packageInfo?: MrPackageInfo;
  diff_refs?: { base_sha: string; head_sha: string; start_sha: string } | null;
};

export interface Mirror {
  subdomain: string;
  latlon?: [number, number];
  healthy: boolean;
  last_update: number;
  geo_active: boolean;
  official: boolean;
}

export interface MirrorSelf {
  addr: string;
  latlon?: [number, number];
  geo: string;
}

export interface MirrorData {
  self: MirrorSelf;
  mirrors: Mirror[];
}

export interface MoleculerCurrentQueueObject {
  count: number;
  labels: {
    build_class: BuildClass[];
    pkgname: string[];
    target_repo: string[];
  };
}

export type ChaoticEvent =
  | {
      type: 'build';
      package: string;
      version: string;
      pkgrel: number;
      bump: number;
      duration: number;
      repo: string;
      status: BuildStatus;
    }
  | {
      type: 'pipeline';
      pipeline: PipelineWithExternalStatus[];
    }
  | {
      type: 'merge_request';
      hasNewMr: boolean;
      mr: MergeRequestWithDiffs[];
    }
  | ({
      type: 'queue';
    } & MoleculerCurrentQueueObject);

export interface NotificationPayload {
  notification: {
    title: string;
    icon: string;
    body: string;
    data: { onActionClick: { default: { operation: 'openWindow'; url: string } } };
  };
}
