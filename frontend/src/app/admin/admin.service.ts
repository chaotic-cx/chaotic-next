import { HttpClient, httpResource, type HttpResourceRef, type HttpResourceRequest } from '@angular/common/http';
import { computed, DestroyRef, inject, Service, signal, type Signal } from '@angular/core';
import {
  AdminPackageElfAnalysis,
  AdjustBuildClassResponse,
  ArchPackage,
  BrokenPackageReport,
  Builder,
  MrAction,
  Package as PackageDto,
  PackageBump,
  Paginated,
  PipelineTriggerAction,
  PKG_TYPE_CHAOTIC,
  PkgType,
  Repo,
  RescanJob,
  addPackagesBodySchema,
  aurSuggestionsQuerySchema,
  bumpPackagesBodySchema,
  brokenPackagesQuerySchema,
  bumpPackagesGitlabBodySchema,
  createBuilderBodySchema,
  createElfAnalysisBodySchema,
  createRepoBodySchema,
  dropPackagesBodySchema,
  listAdminPackagesQuerySchema,
  listArchPackagesQuerySchema,
  listBuildersQuerySchema,
  listElfAnalysisQuerySchema,
  listMrActionsQuerySchema,
  listPackageBumpsQuerySchema,
  listPipelineTriggersQuerySchema,
  MAX_PER_PAGE,
  rescanPackagesBodySchema,
  runScheduleBodySchema,
  scheduleBuildBodySchema,
  schedulesQuerySchema,
  updateArchPackageBodySchema,
  updatePackageBodySchema,
} from '@chaotic-next/shared-lib';
import { MessageToastService } from '@garudalinux/core/message-toast';
import { TranslocoService } from '@jsverse/transloco';
import { lastValueFrom, Observable } from 'rxjs';
import { APP_CONFIG } from '../../environments/app-config.token';
import { backendErrorMessage } from '../api-errors';
import {
  debouncedSignal,
  loadingWithoutValue,
  resourceFailed,
  resourceSignal,
  retainedResourceValue,
} from '../functions';
import { injectActiveTranslation } from '../i18n/active-translation';
import { parseQueryParams, type QueryParams } from '../utils/api-params';

const SEARCH_DEBOUNCE_MS = 400;

const RESCAN_POLL_TIMEOUT_MS = 120_000;
const RESCAN_POLL_INTERVAL_MS = 1_000;
const RESCAN_NAMED_LIMIT = 3;

export interface PackageFormData {
  pkgname: string;
  isActive: boolean;
  skipSignalScan: boolean;
  version?: string;
  pkgrel?: number;
  bump?: number;
  repoId?: number;
  failureSilenced?: boolean;
}

export interface ArchPackageFormData {
  pkgname: string;
  version?: string;
  pkgrel?: number;
  arch?: string;
}

export interface RepoFormData {
  name: string;
  repoUrl?: string;
  isActive: boolean;
  gitRef: string;
  dbPath?: string;
  gitlabProjectId?: string;
  apiToken?: string;
}

export interface BuilderFormData {
  name: string;
  description?: string;
  builderClass?: string;
  isActive: boolean;
}

export interface ElfAnalysisFormData {
  pkgType: '0' | '1';
  pkgId: number;
  version: string;
  broken: boolean;
  brokenReasons: string[];
}

export const DEFAULT_ADMIN_PER_PAGE = 25;

export const DEFAULT_PACKAGE_ACTIVE_FILTER = 'true';

export type AdminList =
  | 'packages'
  | 'archPackages'
  | 'repos'
  | 'builders'
  | 'mrActions'
  | 'pipelineTriggers'
  | 'packageBumps'
  | 'elfAnalysis'
  | 'brokenReports';

export interface ActiveOption {
  label: string;
  value: 'true' | 'false';
}

/**
 * Error state of one admin list, for the inline load error and its retry.
 */
export interface AdminListStatus {
  failed: Signal<boolean>;
  error: Signal<unknown>;
  reload(): void;
}

function listStatus(resource: HttpResourceRef<unknown>): AdminListStatus {
  return {
    failed: resourceFailed(resource),
    error: resource.error,
    reload: () => {
      resource.reload();
    },
  };
}

@Service()
export class AdminService {
  private readonly backendUrl = inject(APP_CONFIG).backendUrl;
  private readonly http = inject(HttpClient);
  private readonly messageToastService = inject(MessageToastService);
  private readonly transloco = inject(TranslocoService);
  private readonly activeTranslation = injectActiveTranslation();

  readonly packagePage = signal(1);
  readonly packagePerPage = signal(DEFAULT_ADMIN_PER_PAGE);
  readonly packageQuery = signal('');
  readonly packageRepoFilter = signal<number | undefined>(undefined);
  readonly packageActiveFilter = signal<'true' | 'false' | undefined>(DEFAULT_PACKAGE_ACTIVE_FILTER);
  readonly archPage = signal(1);
  readonly archPerPage = signal(DEFAULT_ADMIN_PER_PAGE);
  readonly archQuery = signal('');

  readonly builderPage = signal(1);
  readonly builderPerPage = signal(DEFAULT_ADMIN_PER_PAGE);
  readonly builderQuery = signal('');
  readonly builderActiveFilter = signal<'true' | 'false' | undefined>(undefined);

  readonly mrActionPage = signal(1);
  readonly mrActionPerPage = signal(DEFAULT_ADMIN_PER_PAGE);
  readonly mrActionQuery = signal('');
  readonly mrActionActionFilter = signal<string | undefined>(undefined);

  readonly pipelineTriggerPage = signal(1);
  readonly pipelineTriggerPerPage = signal(DEFAULT_ADMIN_PER_PAGE);
  readonly pipelineTriggerQuery = signal('');
  readonly pipelineTriggerOperationFilter = signal<string | undefined>(undefined);

  readonly packageBumpPage = signal(1);
  readonly packageBumpPerPage = signal(DEFAULT_ADMIN_PER_PAGE);
  readonly packageBumpQuery = signal('');
  readonly packageBumpTypeFilter = signal<number | undefined>(undefined);
  readonly packageBumpSourceFilter = signal<number | undefined>(undefined);

  readonly elfAnalysisPage = signal(1);
  readonly elfAnalysisPerPage = signal(DEFAULT_ADMIN_PER_PAGE);
  readonly elfAnalysisQuery = signal('');
  readonly elfAnalysisPkgTypeFilter = signal<'0' | '1' | undefined>(undefined);
  readonly elfAnalysisBrokenFilter = signal<boolean | undefined>(undefined);

  readonly brokenPage = signal(1);
  readonly brokenPerPage = signal(DEFAULT_ADMIN_PER_PAGE);
  readonly brokenSelection = signal<BrokenPackageReport[]>([]);

  readonly activeOptions = computed<ActiveOption[]>(() => {
    this.activeTranslation();

    return [
      { label: this.transloco.translate('admin.service.activeOptions.active'), value: 'true' },
      { label: this.transloco.translate('admin.service.activeOptions.inactive'), value: 'false' },
    ];
  });

  /** How many live components use each list. A list only loads while its count is above zero. */
  private readonly listUsers = signal<ReadonlyMap<AdminList, number>>(new Map());

  /** Loads the given lists while the calling component lives. Call it from a constructor. */
  useLists(lists: AdminList[], destroyRef = inject(DestroyRef)): void {
    this.changeListUsers(lists, 1);
    destroyRef.onDestroy(() => this.changeListUsers(lists, -1));
  }

  private changeListUsers(lists: AdminList[], delta: number): void {
    this.listUsers.update((current) => {
      const next = new Map(current);
      for (const list of lists) next.set(list, (next.get(list) ?? 0) + delta);
      return next;
    });
  }

  private whenActive<T>(list: AdminList, request: () => T): T | undefined {
    return (this.listUsers().get(list) ?? 0) > 0 ? request() : undefined;
  }

  private readonly debouncedPackageQuery = debouncedSignal(this.packageQuery, SEARCH_DEBOUNCE_MS);
  private readonly debouncedArchQuery = debouncedSignal(this.archQuery, SEARCH_DEBOUNCE_MS);
  private readonly debouncedBuilderQuery = debouncedSignal(this.builderQuery, SEARCH_DEBOUNCE_MS);
  private readonly debouncedMrActionQuery = debouncedSignal(this.mrActionQuery, SEARCH_DEBOUNCE_MS);
  private readonly debouncedPipelineTriggerQuery = debouncedSignal(this.pipelineTriggerQuery, SEARCH_DEBOUNCE_MS);
  private readonly debouncedPackageBumpQuery = debouncedSignal(this.packageBumpQuery, SEARCH_DEBOUNCE_MS);
  private readonly debouncedElfAnalysisQuery = debouncedSignal(this.elfAnalysisQuery, SEARCH_DEBOUNCE_MS);

  private readonly packagesResource = httpResource<Paginated<PackageDto>>(() =>
    this.whenActive('packages', () => ({
      url: `${this.backendUrl}/admin/packages`,
      params: parseQueryParams(listAdminPackagesQuerySchema, {
        page: this.packagePage(),
        perPage: this.packagePerPage(),
        q: this.debouncedPackageQuery(),
        repoId: this.packageRepoFilter(),
        active: this.packageActiveFilter(),
      }),
    })),
  );

  private readonly archPackagesResource = httpResource<Paginated<ArchPackage>>(() =>
    this.whenActive('archPackages', () => ({
      url: `${this.backendUrl}/admin/arch-packages`,
      params: parseQueryParams(listArchPackagesQuerySchema, {
        page: this.archPage(),
        perPage: this.archPerPage(),
        q: this.debouncedArchQuery(),
      }),
    })),
  );

  private readonly reposResource = httpResource<Repo[]>(() =>
    this.whenActive('repos', () => `${this.backendUrl}/admin/repos`),
  );

  private readonly buildersResource = httpResource<Paginated<Builder>>(() =>
    this.whenActive('builders', () => ({
      url: `${this.backendUrl}/admin/builders`,
      params: parseQueryParams(listBuildersQuerySchema, {
        page: this.builderPage(),
        perPage: this.builderPerPage(),
        q: this.debouncedBuilderQuery(),
        active: this.builderActiveFilter(),
      }),
    })),
  );

  private readonly mrActionsResource = httpResource<Paginated<MrAction>>(() =>
    this.whenActive('mrActions', () => ({
      url: `${this.backendUrl}/admin/mr-actions`,
      params: parseQueryParams(listMrActionsQuerySchema, {
        page: this.mrActionPage(),
        perPage: this.mrActionPerPage(),
        q: this.debouncedMrActionQuery(),
        action: this.mrActionActionFilter(),
      }),
    })),
  );

  private readonly pipelineTriggersResource = httpResource<Paginated<PipelineTriggerAction>>(() =>
    this.whenActive('pipelineTriggers', () => ({
      url: `${this.backendUrl}/admin/pipeline-triggers`,
      params: parseQueryParams(listPipelineTriggersQuerySchema, {
        page: this.pipelineTriggerPage(),
        perPage: this.pipelineTriggerPerPage(),
        q: this.debouncedPipelineTriggerQuery(),
        operation: this.pipelineTriggerOperationFilter(),
      }),
    })),
  );

  private readonly packageBumpsResource = httpResource<Paginated<PackageBump>>(() =>
    this.whenActive('packageBumps', () => ({
      url: `${this.backendUrl}/admin/package-bumps`,
      params: parseQueryParams(listPackageBumpsQuerySchema, {
        page: this.packageBumpPage(),
        perPage: this.packageBumpPerPage(),
        q: this.debouncedPackageBumpQuery(),
        bumpType: this.packageBumpTypeFilter(),
        triggerFrom: this.packageBumpSourceFilter(),
      }),
    })),
  );

  private readonly elfAnalysisResource = httpResource<Paginated<AdminPackageElfAnalysis>>(() =>
    this.whenActive('elfAnalysis', () => ({
      url: `${this.backendUrl}/admin/package-elf-analysis`,
      params: parseQueryParams(listElfAnalysisQuerySchema, {
        page: this.elfAnalysisPage(),
        perPage: this.elfAnalysisPerPage(),
        q: this.debouncedElfAnalysisQuery(),
        pkgType: this.elfAnalysisPkgTypeFilter(),
        broken: this.elfAnalysisBrokenFilter() === undefined ? undefined : String(this.elfAnalysisBrokenFilter()),
      }),
    })),
  );

  readonly packages = retainedResourceValue(this.packagesResource);
  readonly packagesTotal = computed(() => this.packages()?.total ?? 0);
  readonly packagesLoading = loadingWithoutValue(this.packagesResource, this.packages);
  readonly packagesStatus = listStatus(this.packagesResource);

  readonly archPackages = retainedResourceValue(this.archPackagesResource);
  readonly archPackagesTotal = computed(() => this.archPackages()?.total ?? 0);
  readonly archPackagesLoading = loadingWithoutValue(this.archPackagesResource, this.archPackages);
  readonly archPackagesStatus = listStatus(this.archPackagesResource);

  readonly repos = retainedResourceValue(this.reposResource);
  readonly reposLoading = loadingWithoutValue(this.reposResource, this.repos);
  readonly reposStatus = listStatus(this.reposResource);
  readonly reposById = computed(() => new Map((this.repos() ?? []).map((repo) => [repo.id, repo])));

  readonly builders = retainedResourceValue(this.buildersResource);
  readonly buildersTotal = computed(() => this.builders()?.total ?? 0);
  readonly buildersLoading = loadingWithoutValue(this.buildersResource, this.builders);
  readonly buildersStatus = listStatus(this.buildersResource);

  readonly mrActions = retainedResourceValue(this.mrActionsResource);
  readonly mrActionsTotal = computed(() => this.mrActions()?.total ?? 0);
  readonly mrActionsLoading = loadingWithoutValue(this.mrActionsResource, this.mrActions);
  readonly mrActionsStatus = listStatus(this.mrActionsResource);

  readonly pipelineTriggers = retainedResourceValue(this.pipelineTriggersResource);
  readonly pipelineTriggersTotal = computed(() => this.pipelineTriggers()?.total ?? 0);
  readonly pipelineTriggersLoading = loadingWithoutValue(this.pipelineTriggersResource, this.pipelineTriggers);
  readonly pipelineTriggersStatus = listStatus(this.pipelineTriggersResource);

  readonly packageBumps = retainedResourceValue(this.packageBumpsResource);
  readonly packageBumpsTotal = computed(() => this.packageBumps()?.total ?? 0);
  readonly packageBumpsLoading = loadingWithoutValue(this.packageBumpsResource, this.packageBumps);
  readonly packageBumpsStatus = listStatus(this.packageBumpsResource);

  readonly elfAnalysis = retainedResourceValue(this.elfAnalysisResource);
  readonly elfAnalysisTotal = computed(() => this.elfAnalysis()?.total ?? 0);
  readonly elfAnalysisLoading = loadingWithoutValue(this.elfAnalysisResource, this.elfAnalysis);
  readonly elfAnalysisStatus = listStatus(this.elfAnalysisResource);

  readonly elfAnalysisBumpsFor = signal<number | undefined>(undefined);

  readonly elfAnalysisBumpsResource = httpResource<PackageBump[]>(() => {
    const id = this.elfAnalysisBumpsFor();
    return id === undefined ? undefined : `${this.backendUrl}/admin/package-elf-analysis/${id}/bumps`;
  });

  readonly elfAnalysisBumps = resourceSignal(this.elfAnalysisBumpsResource);
  readonly elfAnalysisBumpsLoading = this.elfAnalysisBumpsResource.isLoading;
  readonly elfAnalysisBumpsStatus = listStatus(this.elfAnalysisBumpsResource);

  setElfAnalysisBumpsFor(id: number | undefined): void {
    this.elfAnalysisBumpsFor.set(id);
  }

  setPackageRepoFilter(repoId: number | null | undefined): void {
    this.packageRepoFilter.set(repoId ?? undefined);
    this.packagePage.set(1);
  }

  setPackageActiveFilter(active: 'true' | 'false' | null | undefined): void {
    this.packageActiveFilter.set(active ?? undefined);
    this.packagePage.set(1);
  }

  async bumpPackages(packages: string[], repo = 'chaotic-aur', ref = 'main'): Promise<void> {
    await this.runMutation(
      () =>
        this.http.post(
          `${this.backendUrl}/gitlab/bump-packages`,
          bumpPackagesGitlabBodySchema.parse({ packages, repo, ref }),
        ),
      this.transloco.translate('admin.service.packageBump.success'),
      this.transloco.translate('admin.service.packageBump.error'),
      () => this.packagesResource.reload(),
    );
  }

  async adjustBuildClass(pkg: PackageDto): Promise<void> {
    try {
      const result = await lastValueFrom(
        this.http.post<AdjustBuildClassResponse>(
          `${this.backendUrl}/admin/packages/${encodeURIComponent(pkg.pkgname)}/adjust-build-class`,
          {},
        ),
      );
      this.reportBuildClassAdjustment(result);
      this.packagesResource.reload();
    } catch (error) {
      this.reportFailure(
        this.transloco.translate('admin.service.buildClassAdjust.error', { pkgname: pkg.pkgname }),
        error,
      );
    }
  }

  async schedulePackages(packages: PackageDto[]): Promise<void> {
    const reponame = packages[0]?.reponame ?? 'chaotic-aur';
    await this.runMutation(
      () =>
        this.http.post(
          `${this.backendUrl}/api/queue/schedule`,
          scheduleBuildBodySchema.parse({
            packages: packages.map((pkg) => pkg.pkgname),
            source_repo: reponame,
            target_repo: reponame,
          }),
        ),
      this.transloco.translate('admin.service.packageSchedule.success'),
      this.transloco.translate('admin.service.packageSchedule.error'),
      () => this.packagesResource.reload(),
    );
  }

  async dropPackages(packages: string[], repo = 'chaotic-aur', ref = 'main'): Promise<void> {
    await this.runMutation(
      () =>
        this.http.post(
          `${this.backendUrl}/gitlab/drop-packages`,
          dropPackagesBodySchema.parse({ packages, repo, ref }),
        ),
      this.transloco.translate('admin.service.packageDrop.success'),
      this.transloco.translate('admin.service.packageDrop.error'),
      () => this.packagesResource.reload(),
    );
  }

  async addPackages(
    packages: { pkgname: string; source?: string }[],
    repo = 'chaotic-aur',
    requestOrigin = 'admin',
    requestReason?: string,
    customRequestReason?: string,
    ref = 'main',
  ): Promise<boolean> {
    return this.runMutation(
      () =>
        this.http.post(
          `${this.backendUrl}/gitlab/add-packages`,
          addPackagesBodySchema.parse({
            packages,
            repo,
            request_origin: requestOrigin,
            request_reason: requestReason !== 'unset' ? requestReason : undefined,
            custom_request_reason: customRequestReason?.trim() || undefined,
            ref,
          }),
        ),
      this.transloco.translate('admin.service.packageAdd.success'),
      this.transloco.translate('admin.service.packageAdd.error'),
      () => this.packagesResource.reload(),
    );
  }

  async runSchedule(scheduleId: number, repo: string): Promise<boolean> {
    return this.runMutation(
      () => this.http.post(`${this.backendUrl}/gitlab/run-schedule`, runScheduleBodySchema.parse({ scheduleId, repo })),
      this.transloco.translate('admin.service.scheduleRun.success'),
      this.transloco.translate('admin.service.scheduleRun.error'),
      () => this.pipelineTriggersResource.reload(),
    );
  }

  async updatePackage(id: number, data: Partial<PackageFormData>): Promise<boolean> {
    /**
     * failureSilenced is form-only display state; the update contract does not
     * carry it (silencing happens through the failed-build silence endpoint).
     */
    const payload = { ...data };
    delete payload.failureSilenced;
    return this.runMutation(
      () =>
        this.http.patch(`${this.backendUrl}/admin/packages/${id}`, updatePackageBodySchema.partial().parse(payload)),
      this.transloco.translate('admin.service.packageUpdate.success'),
      this.transloco.translate('admin.service.packageUpdate.error'),
      () => this.packagesResource.reload(),
    );
  }

  async deletePackage(id: number): Promise<void> {
    await this.runMutation(
      () => this.http.delete(`${this.backendUrl}/admin/packages/${id}`),
      this.transloco.translate('admin.service.packageDelete.success'),
      this.transloco.translate('admin.service.packageDelete.error'),
      () => this.packagesResource.reload(),
    );
  }

  async updateArchPackage(id: number, data: Partial<ArchPackageFormData>): Promise<boolean> {
    return this.runMutation(
      () =>
        this.http.patch(
          `${this.backendUrl}/admin/arch-packages/${id}`,
          updateArchPackageBodySchema.partial().parse(data),
        ),
      this.transloco.translate('admin.service.archPackageUpdate.success'),
      this.transloco.translate('admin.service.archPackageUpdate.error'),
      () => this.archPackagesResource.reload(),
    );
  }

  async deleteArchPackage(id: number): Promise<void> {
    await this.runMutation(
      () => this.http.delete(`${this.backendUrl}/admin/arch-packages/${id}`),
      this.transloco.translate('admin.service.archPackageDelete.success'),
      this.transloco.translate('admin.service.archPackageDelete.error'),
      () => this.archPackagesResource.reload(),
    );
  }

  async updateRepo(id: number, data: Partial<RepoFormData>): Promise<boolean> {
    return this.runMutation(
      () => this.http.patch(`${this.backendUrl}/admin/repos/${id}`, createRepoBodySchema.partial().parse(data)),
      this.transloco.translate('admin.service.repoUpdate.success'),
      this.transloco.translate('admin.service.repoUpdate.error'),
      () => this.reposResource.reload(),
    );
  }

  async deleteRepo(id: number): Promise<void> {
    await this.runMutation(
      () => this.http.delete(`${this.backendUrl}/admin/repos/${id}`),
      this.transloco.translate('admin.service.repoDelete.success'),
      this.transloco.translate('admin.service.repoDelete.error'),
      () => this.reposResource.reload(),
    );
  }

  async updateBuilder(id: number, data: Partial<BuilderFormData>): Promise<boolean> {
    return this.runMutation(
      () => this.http.patch(`${this.backendUrl}/admin/builders/${id}`, createBuilderBodySchema.partial().parse(data)),
      this.transloco.translate('admin.service.builderUpdate.success'),
      this.transloco.translate('admin.service.builderUpdate.error'),
      () => this.buildersResource.reload(),
    );
  }

  async deleteBuilder(id: number): Promise<void> {
    await this.runMutation(
      () => this.http.delete(`${this.backendUrl}/admin/builders/${id}`),
      this.transloco.translate('admin.service.builderDelete.success'),
      this.transloco.translate('admin.service.builderDelete.error'),
      () => this.buildersResource.reload(),
    );
  }

  async updateElfAnalysis(id: number, data: Partial<ElfAnalysisFormData>): Promise<boolean> {
    return this.runMutation(
      () =>
        this.http.patch(
          `${this.backendUrl}/admin/package-elf-analysis/${id}`,
          createElfAnalysisBodySchema.partial().parse(data),
        ),
      this.transloco.translate('admin.service.elfAnalysisUpdate.success'),
      this.transloco.translate('admin.service.elfAnalysisUpdate.error'),
      () => this.elfAnalysisResource.reload(),
    );
  }

  async deleteElfAnalysis(id: number): Promise<void> {
    await this.runMutation(
      () => this.http.delete(`${this.backendUrl}/admin/package-elf-analysis/${id}`),
      this.transloco.translate('admin.service.elfAnalysisDelete.success'),
      this.transloco.translate('admin.service.elfAnalysisDelete.error'),
      () => this.elfAnalysisResource.reload(),
    );
  }

  private readonly brokenReportsResource = httpResource<Paginated<BrokenPackageReport>>(() =>
    this.whenActive('brokenReports', () => ({
      url: `${this.backendUrl}/repo/broken`,
      params: parseQueryParams(brokenPackagesQuerySchema, {
        page: this.brokenPage(),
        perPage: this.brokenPerPage(),
      }),
    })),
  );

  private readonly brokenReportsPage = retainedResourceValue(this.brokenReportsResource);
  readonly brokenReports = computed(() => this.brokenReportsPage()?.items ?? []);
  readonly brokenReportsTotal = computed(() => this.brokenReportsPage()?.total ?? 0);
  readonly brokenReportsLoading = loadingWithoutValue(this.brokenReportsResource, this.brokenReportsPage);
  readonly brokenReportsStatus = listStatus(this.brokenReportsResource);

  async triggerRepoRun(): Promise<void> {
    await this.runMutation(
      () => this.http.post(`${this.backendUrl}/repo/run`, {}),
      this.transloco.translate('admin.service.repoRun.success'),
      this.transloco.translate('admin.service.repoRun.error'),
    );
  }

  async triggerSignalScan(): Promise<void> {
    await this.runMutation(
      () => this.http.post(`${this.backendUrl}/repo/signal-scan`, {}),
      this.transloco.translate('admin.service.signalScan.success'),
      this.transloco.translate('admin.service.signalScan.error'),
    );
  }

  async triggerMrScan(): Promise<void> {
    await this.runMutation(
      () => this.http.post(`${this.backendUrl}/gitlab/mr-scan`, {}),
      this.transloco.translate('admin.service.mrScan.success'),
      this.transloco.translate('admin.service.mrScan.error'),
    );
  }

  async indexArchMirror(): Promise<void> {
    await this.runMutation(
      () => this.http.post(`${this.backendUrl}/repo/index/arch`, {}),
      this.transloco.translate('admin.service.archMirrorIndex.success'),
      this.transloco.translate('admin.service.archMirrorIndex.error'),
    );
  }

  async indexChaoticRepo(): Promise<void> {
    await this.runMutation(
      () => this.http.post(`${this.backendUrl}/repo/index/chaotic`, {}),
      this.transloco.translate('admin.service.chaoticRepoIndex.success'),
      this.transloco.translate('admin.service.chaoticRepoIndex.error'),
    );
  }

  async rescanBuildClasses(): Promise<void> {
    await this.runMutation(
      () => this.http.post(`${this.backendUrl}/admin/rescan-build-classes`, {}),
      this.transloco.translate('admin.service.buildClassRescan.success'),
      this.transloco.translate('admin.service.buildClassRescan.error'),
    );
  }

  async recomputeSignalDerivations(): Promise<void> {
    await this.runMutation(
      () => this.http.post(`${this.backendUrl}/admin/recompute-signal-derivations`, {}),
      this.transloco.translate('admin.service.signalDerivationRecompute.success'),
      this.transloco.translate('admin.service.signalDerivationRecompute.error'),
    );
  }

  async rescanPackage(pkgname: string, pkgType: PkgType): Promise<void> {
    try {
      const jobId = await this.startRescan([{ pkgname, pkgType }]);
      this.messageToastService.success(
        this.transloco.translate('admin.service.rescan.startedSummary'),
        this.rescanStartedDetail([pkgname]),
      );
      const job = await this.waitForRescan(jobId);
      this.reportRescanOutcome(job);
    } catch (error) {
      this.reportFailure(this.transloco.translate('admin.service.rescan.packageError', { pkgname }), error);
    }
  }

  async rescanBrokenPackages(): Promise<void> {
    const packages = this.brokenSelection().map((report) => ({
      pkgname: report.pkgname,
      pkgType: PKG_TYPE_CHAOTIC,
      repo: report.repoName,
    }));
    try {
      const jobId = await this.startRescan(packages);
      this.brokenSelection.set([]);
      this.messageToastService.success(
        this.transloco.translate('admin.service.rescan.startedSummary'),
        this.rescanStartedDetail(packages.map((pkg) => pkg.pkgname)),
      );
      const job = await this.waitForRescan(jobId);
      this.reportRescanOutcome(job);
      this.brokenReportsResource.reload();
    } catch (error) {
      this.reportFailure(this.transloco.translate('admin.service.rescan.error'), error);
    }
  }

  async bumpBrokenPackages(): Promise<void> {
    const pkgnames = this.brokenSelection().map((report) => report.pkgname);
    await this.runMutation(
      () =>
        this.http.post<{ bumped: string[] }>(
          `${this.backendUrl}/repo/broken/bump`,
          bumpPackagesBodySchema.parse({ pkgnames }),
        ),
      this.transloco.translate('admin.service.brokenBump.success', { count: pkgnames.length }),
      this.transloco.translate('admin.service.brokenBump.error'),
      () => {
        this.brokenSelection.set([]);
        this.brokenReportsResource.reload();
      },
    );
  }

  getAurSuggestionsRequest(query: string): HttpResourceRequest | undefined {
    const parsed = aurSuggestionsQuerySchema.safeParse({ q: query.trim() });
    if (!parsed.success) return undefined;

    return { url: `${this.backendUrl}/aur/suggestions`, params: parsed.data };
  }

  getPackageUrl(pkgname: string): string | undefined {
    const trimmed = pkgname.trim();
    if (!trimmed) return undefined;

    return `${this.backendUrl}/builder/package/${encodeURIComponent(trimmed)}`;
  }

  getSchedulesRequest(repo: string): HttpResourceRequest | undefined {
    const parsed = schedulesQuerySchema.safeParse({ repo });
    if (!parsed.success) return undefined;

    return { url: `${this.backendUrl}/gitlab/schedules`, params: parsed.data };
  }

  /**
   * Current state of a package, for the conflict check of the edit dialog.
   */
  findPackage(pkg: PackageDto): Promise<PackageDto | undefined> {
    const params = parseQueryParams(listAdminPackagesQuerySchema, { q: pkg.pkgname, perPage: MAX_PER_PAGE });
    return this.findOnListPage(`${this.backendUrl}/admin/packages`, params, pkg.id);
  }

  findArchPackage(pkg: ArchPackage): Promise<ArchPackage | undefined> {
    const params = parseQueryParams(listArchPackagesQuerySchema, { q: pkg.pkgname, perPage: MAX_PER_PAGE });
    return this.findOnListPage(`${this.backendUrl}/admin/arch-packages`, params, pkg.id);
  }

  findBuilder(builder: Builder): Promise<Builder | undefined> {
    const params = parseQueryParams(listBuildersQuerySchema, { q: builder.name, perPage: MAX_PER_PAGE });
    return this.findOnListPage(`${this.backendUrl}/admin/builders`, params, builder.id);
  }

  findElfAnalysis(row: AdminPackageElfAnalysis): Promise<AdminPackageElfAnalysis | undefined> {
    const query = row.pkgname ?? String(row.pkgId);
    const params = parseQueryParams(listElfAnalysisQuerySchema, { q: query, perPage: MAX_PER_PAGE });
    return this.findOnListPage(`${this.backendUrl}/admin/package-elf-analysis`, params, row.id);
  }

  async findRepo(id: number): Promise<Repo | undefined> {
    // eslint-disable-next-line @dr460nf1r3/prefer-http-resource -- one-shot conflict check when a dialog saves
    const repos = await lastValueFrom(this.http.get<Repo[]>(`${this.backendUrl}/admin/repos`));
    return repos.find((repo) => repo.id === id);
  }

  /**
   * The list endpoints have no single-record route, so a record is looked up by name on the first list page.
   * Resolves to undefined when the record is not on that page.
   */
  private async findOnListPage<T extends { id: number }>(
    url: string,
    params: QueryParams,
    id: number,
  ): Promise<T | undefined> {
    // eslint-disable-next-line @dr460nf1r3/prefer-http-resource -- one-shot conflict check when a dialog saves
    const page = await lastValueFrom(this.http.get<Paginated<T>>(url, { params }));
    return page.items.find((item) => item.id === id);
  }

  /**
   * Runs a write request and reports the outcome in a toast.
   * Resolves to false on failure, so a dialog can stay open with the user's input.
   */
  private async runMutation(
    request: () => Observable<unknown>,
    successDetail: string,
    errorDetail: string,
    onSuccess?: () => void,
  ): Promise<boolean> {
    try {
      await lastValueFrom(request());
    } catch (error) {
      this.reportFailure(errorDetail, error);
      return false;
    }

    this.messageToastService.success(this.transloco.translate('admin.service.summary.success'), successDetail);
    onSuccess?.();
    return true;
  }

  private reportFailure(detail: string, error: unknown): void {
    this.messageToastService.error(
      this.transloco.translate('admin.service.summary.operationFailed'),
      backendErrorMessage(error, detail),
    );
    console.error(detail, error);
  }

  private reportBuildClassAdjustment(result: AdjustBuildClassResponse): void {
    const params = { pkgbase: result.pkgbase, buildClass: result.buildClass };

    if (result.adjusted) {
      this.messageToastService.success(
        this.transloco.translate('admin.service.buildClassAdjust.adjustedSummary'),
        this.transloco.translate('admin.service.buildClassAdjust.adjustedDetail', params),
      );
      return;
    }

    this.messageToastService.success(
      this.transloco.translate('admin.service.buildClassAdjust.unchangedSummary'),
      this.transloco.translate('admin.service.buildClassAdjust.unchangedDetail', params),
    );
  }

  private async startRescan(packages: { pkgname: string; pkgType: string; repo?: string }[]): Promise<string> {
    const { jobId } = await lastValueFrom(
      this.http.post<{ started: number; jobId: string }>(
        `${this.backendUrl}/admin/rescan`,
        rescanPackagesBodySchema.parse({ packages }),
      ),
    );
    return jobId;
  }

  private async waitForRescan(jobId: string): Promise<RescanJob | null> {
    const deadline = Date.now() + RESCAN_POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, RESCAN_POLL_INTERVAL_MS));
      try {
        // eslint-disable-next-line @dr460nf1r3/prefer-http-resource -- bounded poll loop inside one rescan action
        const job = await lastValueFrom(this.http.get<RescanJob>(`${this.backendUrl}/admin/rescan/${jobId}`));
        if (job.status === 'done') return job;
      } catch {
        // Transient poll failures are tolerated; the deadline bounds the wait.
      }
    }
    return null;
  }

  private reportRescanOutcome(job: RescanJob | null): void {
    if (!job) {
      this.messageToastService.info(
        this.transloco.translate('admin.service.rescan.stillRunningSummary'),
        this.transloco.translate('admin.service.rescan.stillRunningDetail'),
      );
      return;
    }

    if (job.failed.length === 0) {
      this.messageToastService.success(
        this.transloco.translate('admin.service.rescan.finishedSummary'),
        this.transloco.translate('admin.service.rescan.finishedDetail', { count: job.rescanned }),
      );
      return;
    }

    this.messageToastService.warn(
      this.transloco.translate('admin.service.rescan.finishedWithFailuresSummary'),
      this.transloco.translate('admin.service.rescan.finishedWithFailuresDetail', {
        rescanned: job.rescanned,
        failedCount: job.failed.length,
        failures: job.failed.join('; '),
      }),
    );
  }

  private rescanStartedDetail(pkgnames: string[]): string {
    if (pkgnames.length <= RESCAN_NAMED_LIMIT) {
      return this.transloco.translate('admin.service.rescan.startedDetail', { packages: pkgnames.join(', ') });
    }

    const named = pkgnames.slice(0, RESCAN_NAMED_LIMIT).join(', ');
    const remaining = pkgnames.length - RESCAN_NAMED_LIMIT;

    return this.transloco.translate('admin.service.rescan.startedDetailTruncated', { packages: named, remaining });
  }
}
