import { HttpClient, httpResource } from '@angular/common/http';
import { computed, inject, Service, signal } from '@angular/core';
import {
  AdminPackageElfAnalysis,
  ArchPackage,
  BrokenPackageReport,
  Builder,
  MrAction,
  Package as PackageDto,
  PackageBump,
  Paginated,
  PipelineScheduleOption,
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
  rescanPackagesBodySchema,
  runScheduleBodySchema,
  scheduleBuildBodySchema,
  schedulesQuerySchema,
  updateArchPackageBodySchema,
  updatePackageBodySchema,
} from '@chaotic-next/shared-lib';
import { MessageToastService } from '@garudalinux/core';
import { lastValueFrom, Observable } from 'rxjs';
import { APP_CONFIG } from '../../environments/app-config.token';
import { backendErrorMessage } from '../api-errors';
import { debouncedSignal, resourceSignal, resourceValue } from '../functions';
import { parseQueryParams } from '../utils/api-params';

const SEARCH_DEBOUNCE_MS = 400;

const RESCAN_POLL_TIMEOUT_MS = 120_000;
const RESCAN_POLL_INTERVAL_MS = 1_000;

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

export interface ActiveOption {
  label: string;
  value: 'true' | 'false';
}

export const ACTIVE_OPTIONS: ActiveOption[] = [
  { label: 'Active', value: 'true' },
  { label: 'Inactive', value: 'false' },
];

@Service()
export class AdminService {
  private readonly backendUrl = inject(APP_CONFIG).backendUrl;
  private readonly http = inject(HttpClient);
  private readonly messageToastService = inject(MessageToastService);

  readonly packagePage = signal(1);
  readonly packagePerPage = signal(DEFAULT_ADMIN_PER_PAGE);
  readonly packageQuery = signal('');
  readonly packageRepoFilter = signal<number | undefined>(undefined);
  readonly packageActiveFilter = signal<'true' | 'false' | undefined>('true');
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

  readonly activeOptions = ACTIVE_OPTIONS;

  private readonly debouncedPackageQuery = debouncedSignal(this.packageQuery, SEARCH_DEBOUNCE_MS);
  private readonly debouncedArchQuery = debouncedSignal(this.archQuery, SEARCH_DEBOUNCE_MS);
  private readonly debouncedBuilderQuery = debouncedSignal(this.builderQuery, SEARCH_DEBOUNCE_MS);
  private readonly debouncedMrActionQuery = debouncedSignal(this.mrActionQuery, SEARCH_DEBOUNCE_MS);
  private readonly debouncedPipelineTriggerQuery = debouncedSignal(this.pipelineTriggerQuery, SEARCH_DEBOUNCE_MS);
  private readonly debouncedPackageBumpQuery = debouncedSignal(this.packageBumpQuery, SEARCH_DEBOUNCE_MS);
  private readonly debouncedElfAnalysisQuery = debouncedSignal(this.elfAnalysisQuery, SEARCH_DEBOUNCE_MS);

  private readonly packagesResource = httpResource<Paginated<PackageDto>>(() => ({
    url: `${this.backendUrl}/admin/packages`,
    params: parseQueryParams(listAdminPackagesQuerySchema, {
      page: this.packagePage(),
      perPage: this.packagePerPage(),
      q: this.debouncedPackageQuery(),
      repoId: this.packageRepoFilter(),
      active: this.packageActiveFilter(),
    }),
  }));

  private readonly archPackagesResource = httpResource<Paginated<ArchPackage>>(() => ({
    url: `${this.backendUrl}/admin/arch-packages`,
    params: parseQueryParams(listArchPackagesQuerySchema, {
      page: this.archPage(),
      perPage: this.archPerPage(),
      q: this.debouncedArchQuery(),
    }),
  }));

  private readonly reposResource = httpResource<Repo[]>(() => `${this.backendUrl}/admin/repos`);

  private readonly buildersResource = httpResource<Paginated<Builder>>(() => ({
    url: `${this.backendUrl}/admin/builders`,
    params: parseQueryParams(listBuildersQuerySchema, {
      page: this.builderPage(),
      perPage: this.builderPerPage(),
      q: this.debouncedBuilderQuery(),
      active: this.builderActiveFilter(),
    }),
  }));

  private readonly mrActionsResource = httpResource<Paginated<MrAction>>(() => ({
    url: `${this.backendUrl}/admin/mr-actions`,
    params: parseQueryParams(listMrActionsQuerySchema, {
      page: this.mrActionPage(),
      perPage: this.mrActionPerPage(),
      q: this.debouncedMrActionQuery(),
      action: this.mrActionActionFilter(),
    }),
  }));

  private readonly pipelineTriggersResource = httpResource<Paginated<PipelineTriggerAction>>(() => ({
    url: `${this.backendUrl}/admin/pipeline-triggers`,
    params: parseQueryParams(listPipelineTriggersQuerySchema, {
      page: this.pipelineTriggerPage(),
      perPage: this.pipelineTriggerPerPage(),
      q: this.debouncedPipelineTriggerQuery(),
      operation: this.pipelineTriggerOperationFilter(),
    }),
  }));

  private readonly packageBumpsResource = httpResource<Paginated<PackageBump>>(() => ({
    url: `${this.backendUrl}/admin/package-bumps`,
    params: parseQueryParams(listPackageBumpsQuerySchema, {
      page: this.packageBumpPage(),
      perPage: this.packageBumpPerPage(),
      q: this.debouncedPackageBumpQuery(),
      bumpType: this.packageBumpTypeFilter(),
      triggerFrom: this.packageBumpSourceFilter(),
    }),
  }));

  private readonly elfAnalysisResource = httpResource<Paginated<AdminPackageElfAnalysis>>(() => ({
    url: `${this.backendUrl}/admin/package-elf-analysis`,
    params: parseQueryParams(listElfAnalysisQuerySchema, {
      page: this.elfAnalysisPage(),
      perPage: this.elfAnalysisPerPage(),
      q: this.debouncedElfAnalysisQuery(),
      pkgType: this.elfAnalysisPkgTypeFilter(),
      broken: this.elfAnalysisBrokenFilter() === undefined ? undefined : String(this.elfAnalysisBrokenFilter()),
    }),
  }));

  readonly packages = resourceSignal(this.packagesResource);
  readonly packagesTotal = computed(() => resourceValue(this.packagesResource)?.total ?? 0);
  readonly packagesLoading = this.packagesResource.isLoading;

  readonly archPackages = resourceSignal(this.archPackagesResource);
  readonly archPackagesTotal = computed(() => resourceValue(this.archPackagesResource)?.total ?? 0);
  readonly archPackagesLoading = this.archPackagesResource.isLoading;

  readonly repos = resourceSignal(this.reposResource);
  readonly reposLoading = this.reposResource.isLoading;
  readonly reposById = computed(
    () => new Map((resourceValue(this.reposResource) ?? []).map((repo) => [repo.id, repo])),
  );

  readonly builders = resourceSignal(this.buildersResource);
  readonly buildersTotal = computed(() => resourceValue(this.buildersResource)?.total ?? 0);
  readonly buildersLoading = this.buildersResource.isLoading;

  readonly mrActions = resourceSignal(this.mrActionsResource);
  readonly mrActionsTotal = computed(() => resourceValue(this.mrActionsResource)?.total ?? 0);
  readonly mrActionsLoading = this.mrActionsResource.isLoading;

  readonly pipelineTriggers = resourceSignal(this.pipelineTriggersResource);
  readonly pipelineTriggersTotal = computed(() => resourceValue(this.pipelineTriggersResource)?.total ?? 0);
  readonly pipelineTriggersLoading = this.pipelineTriggersResource.isLoading;

  readonly packageBumps = resourceSignal(this.packageBumpsResource);
  readonly packageBumpsTotal = computed(() => resourceValue(this.packageBumpsResource)?.total ?? 0);
  readonly packageBumpsLoading = this.packageBumpsResource.isLoading;

  readonly elfAnalysis = resourceSignal(this.elfAnalysisResource);
  readonly elfAnalysisTotal = computed(() => resourceValue(this.elfAnalysisResource)?.total ?? 0);
  readonly elfAnalysisLoading = this.elfAnalysisResource.isLoading;

  readonly elfAnalysisBumpsFor = signal<number | undefined>(undefined);

  readonly elfAnalysisBumpsResource = httpResource<PackageBump[]>(() => {
    const id = this.elfAnalysisBumpsFor();
    return id === undefined ? undefined : `${this.backendUrl}/admin/package-elf-analysis/${id}/bumps`;
  });

  readonly elfAnalysisBumps = resourceSignal(this.elfAnalysisBumpsResource);
  readonly elfAnalysisBumpsLoading = this.elfAnalysisBumpsResource.isLoading;

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
      'Package bump triggered',
      'Could not trigger package bump.',
      () => this.packagesResource.reload(),
    );
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
      'Package build scheduled',
      'Could not schedule package build.',
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
      'Package drop triggered',
      'Could not trigger package drop.',
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
  ): Promise<void> {
    await this.runMutation(
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
      'Package add triggered',
      'Could not trigger package add.',
      () => this.packagesResource.reload(),
    );
  }

  async runSchedule(scheduleId: number, repo: string): Promise<void> {
    await this.runMutation(
      () => this.http.post(`${this.backendUrl}/gitlab/run-schedule`, runScheduleBodySchema.parse({ scheduleId, repo })),
      'Schedule execution triggered',
      'Could not trigger schedule execution.',
      () => this.pipelineTriggersResource.reload(),
    );
  }

  async updatePackage(id: number, data: Partial<PackageFormData>): Promise<void> {
    // failureSilenced is form-only display state; the update contract does not
    // carry it (silencing happens through the failed-build silence endpoint).
    const payload = { ...data };
    delete payload.failureSilenced;
    await this.runMutation(
      () =>
        this.http.patch(`${this.backendUrl}/admin/packages/${id}`, updatePackageBodySchema.partial().parse(payload)),
      'Package updated',
      'Could not update the package.',
      () => this.packagesResource.reload(),
    );
  }

  async deletePackage(id: number): Promise<void> {
    await this.runMutation(
      () => this.http.delete(`${this.backendUrl}/admin/packages/${id}`),
      'Package deleted',
      'Could not delete the package.',
      () => this.packagesResource.reload(),
    );
  }

  async updateArchPackage(id: number, data: Partial<ArchPackageFormData>): Promise<void> {
    await this.runMutation(
      () =>
        this.http.patch(
          `${this.backendUrl}/admin/arch-packages/${id}`,
          updateArchPackageBodySchema.partial().parse(data),
        ),
      'Arch package updated',
      'Could not update the Arch package.',
      () => this.archPackagesResource.reload(),
    );
  }

  async deleteArchPackage(id: number): Promise<void> {
    await this.runMutation(
      () => this.http.delete(`${this.backendUrl}/admin/arch-packages/${id}`),
      'Arch package deleted',
      'Could not delete the Arch package.',
      () => this.archPackagesResource.reload(),
    );
  }

  async createRepo(data: RepoFormData): Promise<void> {
    await this.runMutation(
      () => this.http.post(`${this.backendUrl}/admin/repos`, createRepoBodySchema.parse(data)),
      'Repo created',
      'Could not create the repo.',
      () => this.reposResource.reload(),
    );
  }

  async updateRepo(id: number, data: Partial<RepoFormData>): Promise<void> {
    await this.runMutation(
      () => this.http.patch(`${this.backendUrl}/admin/repos/${id}`, createRepoBodySchema.partial().parse(data)),
      'Repo updated',
      'Could not update the repo.',
      () => this.reposResource.reload(),
    );
  }

  async deleteRepo(id: number): Promise<void> {
    await this.runMutation(
      () => this.http.delete(`${this.backendUrl}/admin/repos/${id}`),
      'Repo deleted',
      'Could not delete the repo.',
      () => this.reposResource.reload(),
    );
  }

  async updateBuilder(id: number, data: Partial<BuilderFormData>): Promise<void> {
    await this.runMutation(
      () => this.http.patch(`${this.backendUrl}/admin/builders/${id}`, createBuilderBodySchema.partial().parse(data)),
      'Builder updated',
      'Could not update the builder.',
      () => this.buildersResource.reload(),
    );
  }

  async deleteBuilder(id: number): Promise<void> {
    await this.runMutation(
      () => this.http.delete(`${this.backendUrl}/admin/builders/${id}`),
      'Builder deleted',
      'Could not delete the builder.',
      () => this.buildersResource.reload(),
    );
  }

  async updateElfAnalysis(id: number, data: Partial<ElfAnalysisFormData>): Promise<void> {
    await this.runMutation(
      () =>
        this.http.patch(
          `${this.backendUrl}/admin/package-elf-analysis/${id}`,
          createElfAnalysisBodySchema.partial().parse(data),
        ),
      'ELF analysis updated',
      'Could not update the ELF analysis.',
      () => this.elfAnalysisResource.reload(),
    );
  }

  async deleteElfAnalysis(id: number): Promise<void> {
    await this.runMutation(
      () => this.http.delete(`${this.backendUrl}/admin/package-elf-analysis/${id}`),
      'ELF analysis deleted',
      'Could not delete the ELF analysis.',
      () => this.elfAnalysisResource.reload(),
    );
  }

  private readonly brokenReportsResource = httpResource<Paginated<BrokenPackageReport>>(() => ({
    url: `${this.backendUrl}/repo/broken`,
    params: parseQueryParams(brokenPackagesQuerySchema, {
      page: this.brokenPage(),
      perPage: this.brokenPerPage(),
    }),
  }));

  readonly brokenReports = computed(() => resourceValue(this.brokenReportsResource)?.items ?? []);
  readonly brokenReportsTotal = computed(() => resourceValue(this.brokenReportsResource)?.total ?? 0);
  readonly brokenReportsLoading = this.brokenReportsResource.isLoading;

  async triggerRepoRun(): Promise<void> {
    await this.runMutation(
      () => this.http.get(`${this.backendUrl}/repo/run`),
      'Repo run started. It can take a while depending on load.',
      'Could not trigger the repo run.',
    );
  }

  async triggerSignalScan(): Promise<void> {
    await this.runMutation(
      () => this.http.get(`${this.backendUrl}/repo/signal-scan`),
      'Signal scan started. It can take a while depending on load.',
      'Could not trigger the signal scan.',
    );
  }

  async triggerMrScan(): Promise<void> {
    await this.runMutation(
      () => this.http.post(`${this.backendUrl}/gitlab/mr-scan`, {}),
      'Merge request scan started. It can take a while depending on load.',
      'Could not trigger the merge request scan.',
    );
  }

  async indexArchMirror(): Promise<void> {
    await this.runMutation(
      () => this.http.post(`${this.backendUrl}/repo/index/arch`, {}),
      'Arch mirror index started. It can take a while depending on load.',
      'Could not trigger the Arch mirror index.',
    );
  }

  async indexChaoticRepo(): Promise<void> {
    await this.runMutation(
      () => this.http.post(`${this.backendUrl}/repo/index/chaotic`, {}),
      'Chaotic repo index started. It can take a while depending on load.',
      'Could not trigger the Chaotic repo index.',
    );
  }

  async rescanBuildClasses(): Promise<void> {
    await this.runMutation(
      () => this.http.post(`${this.backendUrl}/admin/rescan-build-classes`, {}),
      'Build class rescan started. It runs in the background.',
      'Could not trigger the build class rescan.',
    );
  }

  async recomputeSignalDerivations(): Promise<void> {
    await this.runMutation(
      () => this.http.post(`${this.backendUrl}/admin/recompute-signal-derivations`, {}),
      'Signal derivation recompute started. It runs in the background and can take a while.',
      'Could not trigger the signal derivation recompute.',
    );
  }

  async rescanPackage(pkgname: string, pkgType: PkgType): Promise<void> {
    try {
      const jobId = await this.startRescan([{ pkgname, pkgType }]);
      this.messageToastService.success('Success', `Rescan of ${pkgname} started.`);
      const job = await this.waitForRescan(jobId);
      this.reportRescanOutcome(job);
    } catch (error) {
      const detail = `Could not start the rescan of ${pkgname}.`;
      this.messageToastService.error('Operation failed', backendErrorMessage(error, detail));
      console.error(detail, error);
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
      this.messageToastService.success('Success', `Rescan of ${packages.length} package(s) started.`);
      const job = await this.waitForRescan(jobId);
      this.reportRescanOutcome(job);
      this.brokenReportsResource.reload();
    } catch (error) {
      const detail = 'Could not start the rescan.';
      this.messageToastService.error('Operation failed', backendErrorMessage(error, detail));
      console.error(detail, error);
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
      `Bumped ${pkgnames.length} package(s) and committed the changes.`,
      'Could not bump the selected packages.',
      () => {
        this.brokenSelection.set([]);
        this.brokenReportsResource.reload();
      },
    );
  }

  async getAurSuggestions(query: string): Promise<string[]> {
    const parsed = aurSuggestionsQuerySchema.safeParse({ q: query.trim() });
    if (!parsed.success) return [];
    try {
      return await lastValueFrom(
        this.http.get<string[]>(`${this.backendUrl}/aur/suggestions`, { params: parsed.data }),
      );
    } catch {
      return [];
    }
  }

  async packageExists(pkgname: string): Promise<boolean> {
    const trimmed = pkgname.trim();
    if (!trimmed) return false;
    try {
      await lastValueFrom(this.http.get(`${this.backendUrl}/builder/package/${encodeURIComponent(trimmed)}`));
      return true;
    } catch {
      return false;
    }
  }

  async getSchedules(repo: string): Promise<PipelineScheduleOption[]> {
    const parsed = schedulesQuerySchema.safeParse({ repo });
    if (!parsed.success) return [];
    try {
      return await lastValueFrom(
        this.http.get<PipelineScheduleOption[]>(`${this.backendUrl}/gitlab/schedules`, { params: parsed.data }),
      );
    } catch {
      return [];
    }
  }

  private async runMutation(
    request: () => Observable<unknown>,
    successDetail: string,
    errorDetail: string,
    onSuccess?: () => void,
  ): Promise<void> {
    try {
      await lastValueFrom(request());
      this.messageToastService.success('Success', successDetail);
      onSuccess?.();
    } catch (error) {
      this.messageToastService.error('Operation failed', backendErrorMessage(error, errorDetail));
      console.error(errorDetail, error);
    }
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
      this.messageToastService.info('Rescan still running', 'It keeps running in the background; check back later.');
      return;
    }
    if (job.failed.length === 0) {
      this.messageToastService.success('Rescan finished', `${job.rescanned} package(s) scanned successfully.`);
      return;
    }
    this.messageToastService.warn(
      'Rescan finished with failures',
      `${job.rescanned} scanned, ${job.failed.length} failed: ${job.failed.join('; ')}`,
    );
  }
}
