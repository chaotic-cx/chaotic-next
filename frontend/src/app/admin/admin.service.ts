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
  PkgType,
  Repo,
} from '@chaotic-next/shared-lib';
import { MessageToastService } from '@garudalinux/core';
import { lastValueFrom, Observable } from 'rxjs';
import { APP_CONFIG } from '../../environments/app-config.token';
import { backendErrorMessage } from '../api-errors';
import { resourceSignal, resourceValue } from '../functions';

export interface PackageFormData {
  pkgname: string;
  isActive: boolean;
  skipSignalScan: boolean;
  version?: string;
  pkgrel?: number;
  bump?: number;
  repoId?: number;
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

  private readonly packagesResource = httpResource<Paginated<PackageDto>>(() => ({
    url: `${this.backendUrl}/admin/packages`,
    params: {
      page: String(this.packagePage()),
      perPage: String(this.packagePerPage()),
      q: this.packageQuery(),
      ...(this.packageRepoFilter() === undefined ? {} : { repoId: String(this.packageRepoFilter()) }),
      ...(this.packageActiveFilter() === undefined ? {} : { active: this.packageActiveFilter() }),
    },
  }));

  private readonly archPackagesResource = httpResource<Paginated<ArchPackage>>(() => ({
    url: `${this.backendUrl}/admin/arch-packages`,
    params: {
      page: String(this.archPage()),
      perPage: String(this.archPerPage()),
      q: this.archQuery(),
    },
  }));

  private readonly reposResource = httpResource<Repo[]>(() => `${this.backendUrl}/admin/repos`);

  private readonly buildersResource = httpResource<Paginated<Builder>>(() => ({
    url: `${this.backendUrl}/admin/builders`,
    params: {
      page: String(this.builderPage()),
      perPage: String(this.builderPerPage()),
      q: this.builderQuery(),
      ...(this.builderActiveFilter() === undefined ? {} : { active: this.builderActiveFilter() }),
    },
  }));

  private readonly mrActionsResource = httpResource<Paginated<MrAction>>(() => ({
    url: `${this.backendUrl}/admin/mr-actions`,
    params: {
      page: String(this.mrActionPage()),
      perPage: String(this.mrActionPerPage()),
      q: this.mrActionQuery(),
      ...(this.mrActionActionFilter() === undefined ? {} : { action: this.mrActionActionFilter() }),
    },
  }));

  private readonly pipelineTriggersResource = httpResource<Paginated<PipelineTriggerAction>>(() => ({
    url: `${this.backendUrl}/admin/pipeline-triggers`,
    params: {
      page: String(this.pipelineTriggerPage()),
      perPage: String(this.pipelineTriggerPerPage()),
      q: this.pipelineTriggerQuery(),
      ...(this.pipelineTriggerOperationFilter() === undefined
        ? {}
        : { operation: this.pipelineTriggerOperationFilter() }),
    },
  }));

  private readonly packageBumpsResource = httpResource<Paginated<PackageBump>>(() => ({
    url: `${this.backendUrl}/admin/package-bumps`,
    params: {
      page: String(this.packageBumpPage()),
      perPage: String(this.packageBumpPerPage()),
      q: this.packageBumpQuery(),
      ...(this.packageBumpTypeFilter() === undefined ? {} : { bumpType: String(this.packageBumpTypeFilter()) }),
      ...(this.packageBumpSourceFilter() === undefined ? {} : { triggerFrom: String(this.packageBumpSourceFilter()) }),
    },
  }));

  private readonly elfAnalysisResource = httpResource<Paginated<AdminPackageElfAnalysis>>(() => ({
    url: `${this.backendUrl}/admin/package-elf-analysis`,
    params: {
      page: String(this.elfAnalysisPage()),
      perPage: String(this.elfAnalysisPerPage()),
      q: this.elfAnalysisQuery(),
      ...(this.elfAnalysisPkgTypeFilter() === undefined ? {} : { pkgType: this.elfAnalysisPkgTypeFilter() }),
      ...(this.elfAnalysisBrokenFilter() === undefined ? {} : { broken: String(this.elfAnalysisBrokenFilter()) }),
    },
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
      () => this.http.post(`${this.backendUrl}/gitlab/bump-packages`, { packages, repo, ref }),
      'Package bump triggered',
      'Could not trigger package bump.',
      () => this.packagesResource.reload(),
    );
  }

  async schedulePackages(packages: PackageDto[]): Promise<void> {
    const reponame = packages[0]?.reponame ?? 'chaotic-aur';
    await this.runMutation(
      () =>
        this.http.post(`${this.backendUrl}/api/queue/schedule`, {
          packages: packages.map((pkg) => pkg.pkgname),
          source_repo: reponame,
          target_repo: reponame,
        }),
      'Package build scheduled',
      'Could not schedule package build.',
      () => this.packagesResource.reload(),
    );
  }

  async dropPackages(packages: string[], repo = 'chaotic-aur', ref = 'main'): Promise<void> {
    await this.runMutation(
      () => this.http.post(`${this.backendUrl}/gitlab/drop-packages`, { packages, repo, ref }),
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
        this.http.post(`${this.backendUrl}/gitlab/add-packages`, {
          packages,
          repo,
          request_origin: requestOrigin,
          request_reason: requestReason !== 'unset' ? requestReason : undefined,
          custom_request_reason: customRequestReason?.trim() || undefined,
          ref,
        }),
      'Package add triggered',
      'Could not trigger package add.',
      () => this.packagesResource.reload(),
    );
  }

  async runSchedule(scheduleId: number): Promise<void> {
    await this.runMutation(
      () => this.http.post(`${this.backendUrl}/gitlab/run-schedule`, { scheduleId }),
      'Schedule execution triggered',
      'Could not trigger schedule execution.',
      () => this.pipelineTriggersResource.reload(),
    );
  }

  async updatePackage(id: number, data: Partial<PackageFormData>): Promise<void> {
    await this.runMutation(
      () => this.http.patch(`${this.backendUrl}/admin/packages/${id}`, data),
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
      () => this.http.patch(`${this.backendUrl}/admin/arch-packages/${id}`, data),
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
      () => this.http.post(`${this.backendUrl}/admin/repos`, data),
      'Repo created',
      'Could not create the repo.',
      () => this.reposResource.reload(),
    );
  }

  async updateRepo(id: number, data: Partial<RepoFormData>): Promise<void> {
    await this.runMutation(
      () => this.http.patch(`${this.backendUrl}/admin/repos/${id}`, data),
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
      () => this.http.patch(`${this.backendUrl}/admin/builders/${id}`, data),
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
      () => this.http.patch(`${this.backendUrl}/admin/package-elf-analysis/${id}`, data),
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
    params: { page: String(this.brokenPage()), perPage: String(this.brokenPerPage()) },
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

  async rescanPackage(pkgname: string, pkgType: PkgType): Promise<void> {
    await this.runMutation(
      () => this.http.post(`${this.backendUrl}/admin/rescan`, { packages: [{ pkgname, pkgType }] }),
      `Rescan of ${pkgname} completed.`,
      `Could not rescan ${pkgname}.`,
    );
  }

  async bumpBrokenPackages(): Promise<void> {
    const pkgnames = this.brokenSelection().map((report) => report.pkgname);
    await this.runMutation(
      () => this.http.post<{ bumped: string[] }>(`${this.backendUrl}/repo/broken/bump`, { pkgnames }),
      `Bumped ${pkgnames.length} package(s) and committed the changes.`,
      'Could not bump the selected packages.',
      () => {
        this.brokenSelection.set([]);
        this.brokenReportsResource.reload();
      },
    );
  }

  async getAurSuggestions(query: string): Promise<string[]> {
    const trimmed = query.trim();
    if (trimmed.length < 2) return [];
    try {
      return await lastValueFrom(
        this.http.get<string[]>(`${this.backendUrl}/aur/suggestions`, { params: { q: trimmed } }),
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

  async getSchedules(): Promise<PipelineScheduleOption[]> {
    try {
      return await lastValueFrom(this.http.get<PipelineScheduleOption[]>(`${this.backendUrl}/gitlab/schedules`));
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
}
