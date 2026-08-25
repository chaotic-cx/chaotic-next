import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { debounce, form, FormField, pattern, required, submit } from '@angular/forms/signals';
import { ActivatedRoute, Router } from '@angular/router';
import {
  formatPkgrel,
  Package as PackageDto,
  PKG_TYPE_CHAOTIC,
  PIPELINE_PKG_BASE_REGEX,
  PIPELINE_REQUEST_REASONS,
  type PipelineRequestReason,
} from '@chaotic-next/shared-lib';
import type { BuildClassSuggestion } from '@chaotic-next/shared-lib';
import { ConfirmationService } from '@openng/optimus-ui/api';
import { AutoComplete, AutoCompleteCompleteEvent } from '@openng/optimus-ui/autocomplete';
import { Button } from '@openng/optimus-ui/button';
import { Checkbox } from '@openng/optimus-ui/checkbox';
import { Dialog } from '@openng/optimus-ui/dialog';
import { IconField } from '@openng/optimus-ui/iconfield';
import { InputIcon } from '@openng/optimus-ui/inputicon';
import { InputText } from '@openng/optimus-ui/inputtext';
import { Select } from '@openng/optimus-ui/select';
import { TableModule } from '@openng/optimus-ui/table';
import { TagModule } from '@openng/optimus-ui/tag';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { AurScanResultComponent } from '../../aur-scan/aur-scan-result.component';
import { AurScanService, isScanSettled } from '../../aur-scan/aur-scan.service';
import { BuildClassPipe } from '../../pipes/build-class.pipe';
import { formatBytes, formatCpuTime, formatDuration } from '../../functions';
import {
  createAdminPagination,
  createDebounced,
  patchQueryParams,
  queryFromRaw,
  queryToQuery,
  restoreQueryParams,
  stringFilterFromQuery,
  stringFilterToQuery,
} from '../admin-url-sync';
import { AdminService, PackageFormData } from '../admin.service';

const REQUEST_REASON_DESCRIPTIONS: Record<PipelineRequestReason, string> = {
  'unset': 'No specific reason.',
  'request': 'Requested by a user.',
  'depends': 'Required as a dependency.',
  'depends:optional': 'Optional dependency.',
  'depends:make': 'Make dependency.',
  'depends:check': 'Check dependency.',
};

interface PackageFormModel {
  pkgname: string;
  isActive: boolean;
  skipSignalScan: boolean;
  failureSilenced: boolean;
  version: string;
  pkgrel: string;
  bump: string;
  repoId: string;
}

const NO_REPO = '0';

@Component({
  selector: 'chaotic-admin-packages-page',
  imports: [
    AutoComplete,
    AurScanResultComponent,
    BuildClassPipe,
    Button,
    Checkbox,
    Dialog,
    FormField,
    FormsModule,
    IconField,
    InputIcon,
    InputText,
    Select,
    TableModule,
    TagModule,
    Tooltip,
  ],
  template: `
    <div class="table-container">
      <p-table
        [value]="adminService.packages()?.items ?? []"
        [rows]="pagination.perPage()"
        [loading]="adminService.packagesLoading()"
        [paginator]="true"
        [lazy]="true"
        [totalRecords]="adminService.packagesTotal()"
        [showCurrentPageReport]="true"
        [rowsPerPageOptions]="[25, 50, 100]"
        (onLazyLoad)="onLazyLoad($event)"
        dataKey="id"
        paginatorDropdownAppendTo="body"
      >
        <ng-template #caption>
          <div class="flex flex-col gap-2.5 sm:flex-row sm:flex-nowrap sm:items-center">
            <div class="flex w-full sm:hidden">
              <p-button
                class="w-full"
                (onClick)="openAddAurDialog()"
                styleClass="w-full justify-center"
                icon="pi pi-plus"
                label="Add package"
                text
                severity="primary"
              />
            </div>
            <div class="hidden sm:ml-auto sm:flex sm:flex-wrap sm:items-center sm:gap-2.5">
              <p-button (onClick)="openAddAurDialog()" icon="pi pi-plus" label="Add package" text severity="primary" />
              <p-select
                [options]="adminService.repos() ?? []"
                [ngModel]="adminService.packageRepoFilter()"
                (ngModelChange)="onRepoChange($event)"
                optionLabel="name"
                optionValue="id"
                placeholder="All repos"
                showClear
                appendTo="body"
              />
              <p-select
                [options]="adminService.activeOptions"
                [ngModel]="adminService.packageActiveFilter()"
                (ngModelChange)="onActiveChange($event)"
                optionLabel="label"
                optionValue="value"
                placeholder="Active status"
                showClear
                appendTo="body"
              />
            </div>
            <p-iconfield class="w-full sm:w-64" iconPosition="left">
              <p-inputicon>
                <i class="pi pi-search"></i>
              </p-inputicon>
              <input
                class="w-full"
                [value]="adminService.packageQuery()"
                (input)="onSearch($event)"
                pInputText
                type="text"
                placeholder="Search pkgname"
              />
            </p-iconfield>
          </div>
        </ng-template>
        <ng-template #header>
          <tr>
            <th style="min-width: 3rem">ID</th>
            <th style="min-width: 12rem">Name</th>
            <th style="min-width: 10rem">Version</th>
            <th style="min-width: 8rem">Repo</th>
            <th style="min-width: 10rem">Pkgbase</th>
            <th style="min-width: 6rem">Class</th>
            <th style="min-width: 10rem">Suggested class</th>
            <th style="min-width: 6rem">Active</th>
            <th class="cell-actions" style="min-width: 8rem">Actions</th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-pkg>
          <tr>
            <td>{{ pkg.id }}</td>
            <td>{{ pkg.pkgname }}</td>
            <td>{{ pkg.version }}{{ pkg.pkgrel ? '-' + formatPkgrel(pkg.pkgrel, pkg.bump ?? 0) : '' }}</td>
            <td>
              @if (pkg.reponame) {
                <button class="cursor-pointer text-ctp-mauve hover:underline" (click)="goToRepos()" type="button">
                  {{ pkg.reponame }}
                </button>
              }
            </td>
            <td>
              @if (pkg.pkgbaseName !== null && pkg.pkgbaseName !== undefined) {
                {{ pkg.pkgbaseName }}
              } @else {
                <span class="text-ctp-subtext0">-</span>
              }
            </td>
            <td>
              @if (pkg.buildClass !== null && pkg.buildClass !== undefined) {
                <span
                  [pTooltip]="buildClassMismatchTooltip(pkg)"
                  [class.text-ctp-red]="hasBuildClassMismatch(pkg)"
                  tooltipPosition="left"
                  >{{ pkg.buildClass | buildClass }}</span
                >
              } @else {
                <span class="text-ctp-subtext0">unset</span>
              }
            </td>
            <td>
              @if (pkg.buildClassSuggestion; as suggestion) {
                @if (suggestion.suggestedBuildClass !== null) {
                  <span [pTooltip]="buildClassSuggestionTooltip(suggestion)" tooltipPosition="left">
                    {{ suggestion.suggestedBuildClass | buildClass }}
                  </span>
                }
              }
            </td>
            <td>
              @if (pkg.isActive) {
                <p-tag value="Active" severity="success" />
              } @else {
                <p-tag value="Inactive" severity="secondary" />
              }
              @if (pkg.failureSilenced) {
                <p-tag
                  value="Silenced"
                  severity="warn"
                  pTooltip="Failure silenced until the next failing build"
                  tooltipPosition="left"
                />
              }
            </td>
            <td class="cell-actions">
              <div class="flex flex-nowrap items-center gap-1 sm:gap-2">
                <p-button
                  (onClick)="bumpPackage(pkg)"
                  icon="pi pi-arrow-up"
                  severity="warn"
                  text
                  rounded
                  pTooltip="Bump"
                  tooltipPosition="left"
                />
                <p-button
                  (onClick)="schedulePackage(pkg)"
                  icon="pi pi-calendar-plus"
                  severity="info"
                  text
                  rounded
                  pTooltip="Schedule build"
                  tooltipPosition="left"
                />
                <p-button
                  (onClick)="rescanPackage(pkg)"
                  icon="pi pi-refresh"
                  severity="success"
                  text
                  rounded
                  pTooltip="Rescan ELF signals"
                  tooltipPosition="left"
                />
                <p-button
                  (onClick)="dropPackage(pkg)"
                  icon="pi pi-minus-circle"
                  severity="danger"
                  text
                  rounded
                  pTooltip="Drop"
                  tooltipPosition="left"
                />
                <p-button
                  (onClick)="openEdit(pkg)"
                  icon="pi pi-pencil"
                  severity="secondary"
                  text
                  rounded
                  pTooltip="Edit"
                  tooltipPosition="left"
                />
                <p-button
                  (onClick)="confirmDelete(pkg)"
                  icon="pi pi-trash"
                  severity="danger"
                  text
                  rounded
                  pTooltip="Delete"
                  tooltipPosition="left"
                />
              </div>
            </td>
          </tr>
        </ng-template>
      </p-table>
    </div>

    <p-dialog
      [(visible)]="dialogVisible"
      [modal]="true"
      [appendTo]="'body'"
      [style]="{ 'width': '64rem', 'max-width': '94vw' }"
      [header]="'Edit package'"
    >
      <form class="flex flex-col gap-4" (submit)="save(); $event.preventDefault()">
        <label class="flex flex-col gap-1">
          <span class="text-ctp-text text-sm">Package name</span>
          <input [formField]="packageForm.pkgname" pInputText type="text" />
          @if (packageForm.pkgname().touched() && packageForm.pkgname().errors().length) {
            <span class="text-ctp-red text-xs">{{ packageForm.pkgname().errors()[0].message }}</span>
          }
        </label>
        <div class="flex flex-wrap gap-4">
          <label class="flex flex-1 flex-col gap-1">
            <span class="text-ctp-text text-sm">Version</span>
            <input [formField]="packageForm.version" pInputText type="text" />
          </label>
          <label class="flex flex-1 flex-col gap-1">
            <span class="text-ctp-text text-sm">Pkgrel</span>
            <input [formField]="packageForm.pkgrel" pInputText type="text" inputmode="numeric" />
          </label>
          <label class="flex flex-1 flex-col gap-1">
            <span class="text-ctp-text text-sm">Bump</span>
            <input [formField]="packageForm.bump" pInputText type="text" inputmode="numeric" />
          </label>
        </div>
        <div class="flex flex-col gap-1">
          <span class="text-ctp-text text-sm">Repo</span>
          <p-select
            [ngModel]="model().repoId"
            [ngModelOptions]="{ standalone: true }"
            [options]="repoOptions()"
            (ngModelChange)="setRepoId($event)"
            optionLabel="label"
            optionValue="value"
            showClear
            appendTo="body"
          />
        </div>
        <div class="flex flex-wrap gap-6">
          <div class="flex items-center gap-2">
            <p-checkbox [formField]="packageForm.isActive" [binary]="true" inputId="pkgIsActive" />
            <label class="text-ctp-text text-sm" for="pkgIsActive">Active</label>
          </div>
          <div class="flex items-center gap-2">
            <p-checkbox [formField]="packageForm.skipSignalScan" [binary]="true" inputId="pkgSkipScan" />
            <label class="text-ctp-text text-sm" for="pkgSkipScan">Skip signal scan</label>
          </div>
          <div class="flex items-center gap-2">
            <p-checkbox
              [formField]="packageForm.failureSilenced"
              [binary]="true"
              inputId="pkgFailureSilenced"
              pTooltip="Hides the package from 'Failed builds with no more recent success' until it fails again"
              tooltipPosition="top"
            />
            <label
              class="text-ctp-text text-sm cursor-help"
              for="pkgFailureSilenced"
              pTooltip="Hides the package from 'Failed builds with no more recent success' until it fails again"
              tooltipPosition="top"
            >
              Silence failed build
            </label>
          </div>
        </div>
        <div class="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <p-button
            (onClick)="dialogVisible.set(false)"
            type="button"
            severity="secondary"
            text
            label="Cancel"
            size="small"
            styleClass="w-full sm:w-auto"
          />
          <p-button
            [disabled]="packageForm().invalid()"
            type="submit"
            severity="primary"
            label="Save"
            size="small"
            styleClass="w-full sm:w-auto"
          />
        </div>
      </form>
    </p-dialog>

    <p-dialog
      [(visible)]="addAurDialogVisible"
      [header]="'Add AUR Package'"
      [modal]="true"
      [style]="{ width: '90vw', maxWidth: '800px' }"
      appendTo="body"
    >
      <div class="flex flex-col gap-4 py-2">
        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-1.5">
            <div class="flex items-center justify-between">
              <span class="font-medium text-ctp-text text-sm">Package name</span>
              @if (aurPackageName() && !isAurMissing()) {
                <a
                  class="font-medium text-ctp-mauve text-sm hover:underline flex items-center gap-1"
                  [href]="'https://aur.archlinux.org/packages/' + aurPackageName()"
                  target="_blank"
                  rel="noopener"
                  pTooltip="Open AUR package page"
                  tooltipPosition="top"
                >
                  AUR <i class="pi pi-external-link text-xs"></i>
                </a>
              }
            </div>
            <p-autoComplete
              class="w-full"
              [ngModel]="aurSearchModel().query"
              [suggestions]="aurSuggestions()"
              [delay]="AUR_SUGGEST_DEBOUNCE_MS"
              (ngModelChange)="aurSearchModel.set({ query: $event })"
              (completeMethod)="searchAurSuggestions($event)"
              (onBlur)="confirmAurPackage()"
              (onSelect)="confirmAurPackage()"
              placeholder="Search AUR package..."
              appendTo="body"
            />
            @if (aurPackageName()) {
              @if (isExistingPackage()) {
                <small class="text-ctp-red font-medium"
                  >Package "{{ aurPackageName() }}" already exists in the repository.</small
                >
              } @else if (isAurMissing()) {
                <small class="text-ctp-red font-medium"
                  >Package "{{ aurPackageName() }}" does not exist in the AUR.</small
                >
              }
            }
          </div>

          @if (aurPackageName() && !isExistingPackage() && !isAurMissing()) {
            <chaotic-aur-scan-result [packageName]="aurPackageName()" />
          }

          <div class="flex flex-col gap-3 border-t border-ctp-surface0 pt-3 mt-1">
            <h4 class="text-ctp-text font-semibold text-sm">Request details</h4>
            <label class="flex flex-col gap-1">
              <span class="text-ctp-text text-sm">Request origin</span>
              <input
                [ngModel]="aurRequestOrigin()"
                (ngModelChange)="aurRequestOrigin.set($event)"
                pInputText
                placeholder="github/5678,chaotic/xiota,forum/tne"
                type="text"
              />
            </label>
            <div class="flex flex-col gap-2">
              <span class="text-ctp-text text-sm">Request reason</span>
              <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                @for (card of requestReasonCards; track card.reason) {
                  <button
                    class="flex cursor-pointer flex-col gap-0.5 rounded-lg border p-2.5 text-left transition-colors hover:border-ctp-mauve hover:bg-ctp-surface0/40"
                    [class.border-ctp-mauve]="aurRequestReason() === card.reason"
                    [class.border-ctp-surface1]="aurRequestReason() !== card.reason"
                    (click)="aurRequestReason.set(card.reason)"
                    type="button"
                  >
                    <span class="text-ctp-text text-xs font-bold">{{ card.reason }}</span>
                    <span class="text-ctp-subtext0 text-[11px] leading-tight">{{ card.description }}</span>
                  </button>
                }
              </div>
            </div>
            <label class="flex flex-col gap-1">
              <span class="text-ctp-text text-sm">Custom request reason</span>
              <input
                [ngModel]="aurCustomRequestReason()"
                (ngModelChange)="aurCustomRequestReason.set($event)"
                pInputText
                placeholder="Describe why this package is being added…"
                type="text"
              />
            </label>
          </div>
        </div>

        <div class="flex flex-row items-center justify-end gap-2 mt-6 pt-4 border-t border-ctp-surface0/50">
          <p-button
            class="flex-1 sm:flex-initial"
            (onClick)="addAurDialogVisible.set(false)"
            styleClass="w-full justify-center sm:w-auto"
            type="button"
            severity="secondary"
            text
            label="Cancel"
            size="small"
          />
          <p-button
            class="flex-1 sm:flex-initial"
            [disabled]="!canAddAurPackage()"
            [icon]="isScanOngoing() || isAdding() ? 'pi pi-spinner pi-spin' : 'pi pi-plus-circle'"
            (onClick)="triggerAddAurPackage()"
            styleClass="w-full justify-center sm:w-auto"
            type="button"
            severity="primary"
            label="Add Package"
            size="small"
          />
        </div>
      </div>
    </p-dialog>
  `,
})
export class AdminPackagesPageComponent {
  private readonly aurScanService = inject(AurScanService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly adminService = inject(AdminService);
  protected readonly formatPkgrel = formatPkgrel;

  protected buildClassSuggestionTooltip(suggestion: BuildClassSuggestion): string {
    const { samples, averages } = suggestion;
    const metrics = [
      averages.avgPeakMemoryBytes != null ? `peak ${formatBytes(averages.avgPeakMemoryBytes)}` : null,
      averages.avgCpuTimeNs != null ? `CPU ${formatCpuTime(averages.avgCpuTimeNs)}` : null,
      averages.avgDiskIoBytes != null ? `disk ${formatBytes(averages.avgDiskIoBytes)}` : null,
      averages.avgDurationSeconds != null ? `took ${formatDuration(averages.avgDurationSeconds)}` : null,
    ].filter((part) => part !== null);
    return [`${samples} ${samples === 1 ? 'build' : 'builds'}`, ...metrics].join(' · ');
  }

  protected hasBuildClassMismatch(pkg: PackageDto): boolean {
    const suggested = pkg.buildClassSuggestion?.suggestedBuildClass;
    if (suggested === null || suggested === undefined) return false;
    return pkg.buildClass !== suggested;
  }

  protected buildClassMismatchTooltip(pkg: PackageDto): string {
    if (!this.hasBuildClassMismatch(pkg)) {
      return 'Matches the class suggested by resource usage';
    }
    const suggested = pkg.buildClassSuggestion?.suggestedBuildClass;
    return suggested !== undefined && suggested !== null
      ? `Resource usage suggests class ${suggested}`
      : 'No resource usage samples yet';
  }

  readonly pagination = createAdminPagination({ router: this.router, route: this.route });

  readonly dialogVisible = signal(false);
  readonly editing = signal<PackageDto | null>(null);

  private readonly syncSearch = createDebounced(400, () =>
    patchQueryParams(this.router, this.route, { q: queryToQuery(this.adminService.packageQuery()) }),
  );

  protected readonly model = signal<PackageFormModel>(emptyModel());
  readonly packageForm = form(this.model, (s) => {
    required(s.pkgname, { message: 'Package name is required' });
  });

  readonly repoOptions = computed(() => [
    { label: 'None', value: NO_REPO },
    ...(this.adminService.repos() ?? []).map((repo) => ({ label: repo.name, value: String(repo.id) })),
  ]);

  protected readonly aurSearchModel = signal({ query: '' });
  protected readonly AUR_SUGGEST_DEBOUNCE_MS = 400;
  protected readonly aurSearchForm = form(this.aurSearchModel, (schemaPath) => {
    debounce(schemaPath.query, 500);
    pattern(schemaPath.query, PIPELINE_PKG_BASE_REGEX, { message: 'Invalid package name format' });
  });

  readonly addAurDialogVisible = signal(false);
  readonly aurPackageName = signal('');
  readonly aurSuggestions = signal<string[]>([]);
  readonly isAurMissing = signal(false);
  readonly isExistingPackage = signal(false);
  readonly isAdding = signal(false);

  readonly isScanOngoing = computed(() => {
    const pkg = this.aurPackageName();
    if (!pkg) return false;
    const scan = this.aurScanService.scanOf(pkg);
    return !!scan && !isScanSettled(scan);
  });

  readonly scanSettled = computed(() => {
    const pkg = this.aurPackageName();
    if (!pkg) return false;
    return isScanSettled(this.aurScanService.scanOf(pkg));
  });

  readonly canAddAurPackage = computed(() => {
    const pkg = this.aurPackageName();
    if (!pkg || this.isAdding()) return false;
    if (this.isExistingPackage() || this.isAurMissing()) return false;
    return this.scanSettled();
  });

  readonly aurRequestOrigin = signal('');
  readonly aurRequestReason = signal<string>('unset');
  readonly aurCustomRequestReason = signal('');

  protected readonly requestReasonCards = PIPELINE_REQUEST_REASONS.map((reason) => ({
    reason,
    description: REQUEST_REASON_DESCRIPTIONS[reason],
  }));

  openAddAurDialog(): void {
    this.aurSearchModel.set({ query: '' });
    this.aurPackageName.set('');
    this.aurSuggestions.set([]);
    this.aurRequestOrigin.set('');
    this.aurRequestReason.set('unset');
    this.aurCustomRequestReason.set('');
    this.isAurMissing.set(false);
    this.isExistingPackage.set(false);
    this.addAurDialogVisible.set(true);
  }

  async searchAurSuggestions(event: AutoCompleteCompleteEvent): Promise<void> {
    const query = event.query.trim();
    if (query.length < 3 || !this.aurSearchForm.query().valid()) {
      this.aurSuggestions.set([]);
      return;
    }
    const suggestions = await this.adminService.getAurSuggestions(query);
    this.aurSuggestions.set(suggestions);
  }

  async triggerAddAurPackage(): Promise<void> {
    const pkgname = this.aurPackageName().trim();
    if (!pkgname || !this.canAddAurPackage()) return;

    const repoFilter = this.adminService.packageRepoFilter();
    const currentRepo = repoFilter !== undefined ? this.adminService.reposById().get(repoFilter)?.name : 'chaotic-aur';

    this.isAdding.set(true);
    try {
      await this.adminService.addPackages(
        [{ pkgname, source: 'aur' }],
        currentRepo ?? 'chaotic-aur',
        this.aurRequestOrigin(),
        this.aurRequestReason(),
        this.aurCustomRequestReason(),
        'main',
      );
      this.addAurDialogVisible.set(false);
    } finally {
      this.isAdding.set(false);
    }
  }

  confirmAurPackage(): void {
    const name = this.aurSearchModel().query.trim();
    const isValid = this.aurSearchForm.query().valid();
    if (!name || name.length < 3 || !isValid) {
      this.aurPackageName.set('');
      this.isAurMissing.set(false);
      this.isExistingPackage.set(false);
      return;
    }

    if (this.aurPackageName() === name) return;

    this.aurPackageName.set(name);
    void Promise.all([this.adminService.packageExists(name), this.adminService.getAurSuggestions(name)]).then(
      ([existsInChaotic, suggestions]) => {
        this.isExistingPackage.set(existsInChaotic);
        this.isAurMissing.set(!suggestions.includes(name));
      },
    );
  }

  constructor() {
    this.pagination.restoreFromQuery(this.route);
    this.adminService.packagePage.set(this.pagination.page());
    this.adminService.packagePerPage.set(this.pagination.perPage());
    restoreQueryParams(this.route, {
      q: (raw) => this.adminService.packageQuery.set(queryFromRaw(raw)),
      repo: (raw) =>
        this.adminService.packageRepoFilter.set(stringFilterFromQuery(raw) === undefined ? undefined : Number(raw)),
      active: (raw) => {
        if (raw === 'true' || raw === 'false') {
          this.adminService.packageActiveFilter.set(raw);
        }
      },
    });
  }

  openEdit(pkg: PackageDto): void {
    this.editing.set(pkg);
    this.model.set({
      pkgname: pkg.pkgname,
      isActive: pkg.isActive,
      skipSignalScan: pkg.skipSignalScan ?? false,
      failureSilenced: pkg.failureSilenced ?? false,
      version: pkg.version ?? '',
      pkgrel: pkg.pkgrel === undefined ? '' : String(pkg.pkgrel),
      bump: pkg.bump === undefined ? '' : String(pkg.bump),
      repoId: pkg.repo === undefined ? NO_REPO : String(pkg.repo),
    });
    this.dialogVisible.set(true);
  }

  save(): void {
    submit(this.packageForm, async () => {
      const data = this.toFormData(this.model());
      const current = this.editing();
      if (current) await this.adminService.updatePackage(current.id, data);
      this.dialogVisible.set(false);
    });
  }

  confirmDelete(pkg: PackageDto): void {
    this.confirmationService.confirm({
      message: `Delete package <code>${pkg.pkgname}</code>? This cannot be undone.`,
      header: 'Delete package',
      acceptLabel: 'Delete',
      rejectLabel: 'Cancel',
      accept: () => void this.adminService.deletePackage(pkg.id),
    });
  }

  bumpPackage(pkg: PackageDto): void {
    this.confirmationService.confirm({
      message: `Bump package <code>${pkg.pkgname}</code>? This will create a Git commit to increment its bump counter in <code>${pkg.pkgname}/.CI/config</code>.`,
      header: 'Bump package',
      acceptLabel: 'Bump',
      rejectLabel: 'Cancel',
      accept: () => void this.adminService.bumpPackages([pkg.pkgname], pkg.reponame),
    });
  }

  schedulePackage(pkg: PackageDto): void {
    this.confirmationService.confirm({
      message: `Schedule package <code>${pkg.pkgname}</code>? This will trigger a build on the manager.`,
      header: 'Schedule package build',
      acceptLabel: 'Schedule',
      rejectLabel: 'Cancel',
      accept: () => void this.adminService.schedulePackages([pkg]),
    });
  }

  rescanPackage(pkg: PackageDto): void {
    this.confirmationService.confirm({
      message: `Rescan ELF signals for <code>${pkg.pkgname}</code>? This will download and scan the package archive.`,
      header: 'Rescan ELF signals',
      acceptLabel: 'Rescan',
      rejectLabel: 'Cancel',
      accept: () => void this.adminService.rescanPackage(pkg.pkgname, PKG_TYPE_CHAOTIC),
    });
  }

  dropPackage(pkg: PackageDto): void {
    this.confirmationService.confirm({
      message: `Drop package <code>${pkg.pkgname}</code>? This will create a Git commit to delete <code>${pkg.pkgname}/.CI/config</code>.`,
      header: 'Drop package',
      acceptLabel: 'Drop',
      rejectLabel: 'Cancel',
      accept: () => void this.adminService.dropPackages([pkg.pkgname], pkg.reponame),
    });
  }

  onLazyLoad(event: { first?: number; rows?: number | null }): void {
    this.pagination.handleLazyLoad(event);
    this.adminService.packagePage.set(this.pagination.page());
    this.adminService.packagePerPage.set(event.rows ?? 25);
  }

  onSearch(event: Event): void {
    this.adminService.packageQuery.set((event.target as HTMLInputElement).value);
    this.pagination.resetPage();
    this.adminService.packagePage.set(1);
    this.syncSearch();
  }

  onRepoChange(repoId: number | null | undefined): void {
    this.pagination.resetPage();
    this.adminService.setPackageRepoFilter(repoId);
    patchQueryParams(this.router, this.route, { repo: stringFilterToQuery(String(repoId ?? '')) });
  }

  onActiveChange(active: 'true' | 'false' | null | undefined): void {
    this.pagination.resetPage();
    this.adminService.setPackageActiveFilter(active);
    patchQueryParams(this.router, this.route, { active: stringFilterToQuery(active ?? undefined) });
  }

  goToRepos(): void {
    void this.router.navigate(['/admin/repos']);
  }

  setRepoId(value: string | null | undefined): void {
    this.model.update((model) => ({ ...model, repoId: value === null || value === undefined ? NO_REPO : value }));
  }

  private toFormData(model: PackageFormModel): PackageFormData {
    return {
      pkgname: model.pkgname,
      isActive: model.isActive,
      skipSignalScan: model.skipSignalScan,
      failureSilenced: model.failureSilenced,
      version: model.version === '' ? undefined : model.version,
      pkgrel: model.pkgrel === '' ? undefined : Number(model.pkgrel),
      bump: model.bump === '' ? undefined : Number(model.bump),
      repoId: model.repoId === NO_REPO ? undefined : Number(model.repoId),
    };
  }
}

function emptyModel(): PackageFormModel {
  return {
    pkgname: '',
    isActive: true,
    skipSignalScan: false,
    failureSilenced: false,
    version: '',
    pkgrel: '',
    bump: '',
    repoId: NO_REPO,
  };
}
