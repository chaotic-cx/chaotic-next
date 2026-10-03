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
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { ConfirmationService, type MenuItem } from '@openng/optimus-ui/api';
import { AutoComplete, AutoCompleteCompleteEvent } from '@openng/optimus-ui/autocomplete';
import { Button } from '@openng/optimus-ui/button';
import { Checkbox } from '@openng/optimus-ui/checkbox';
import { Dialog } from '@openng/optimus-ui/dialog';
import { Menu } from '@openng/optimus-ui/menu';
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
import { injectActiveTranslation } from '../../i18n/active-translation';
import {
  createAdminPagination,
  type StatefulTableRef,
  createDebounced,
  patchQueryParams,
  queryFromRaw,
  queryToQuery,
  restoreQueryParams,
  stringFilterFromQuery,
  stringFilterToQuery,
} from '../admin-url-sync';
import { AdminService, PackageFormData } from '../admin.service';
import { TABLE_ROW_HEIGHTS } from '../../table-skeleton/table-row-heights';
import { TableSkeletonRowsComponent } from '../../table-skeleton/table-skeleton-rows.component';

const REQUEST_REASON_DESCRIPTION_KEYS: Record<PipelineRequestReason, string> = {
  'unset': marker('admin.packages.requestReasons.unset'),
  'request': marker('admin.packages.requestReasons.request'),
  'depends': marker('admin.packages.requestReasons.depends'),
  'depends:optional': marker('admin.packages.requestReasons.dependsOptional'),
  'depends:make': marker('admin.packages.requestReasons.dependsMake'),
  'depends:check': marker('admin.packages.requestReasons.dependsCheck'),
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
    TableSkeletonRowsComponent,
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
    Menu,
    Select,
    TableModule,
    TagModule,
    Tooltip,
    TranslocoDirective,
  ],
  template: `
    <ng-container *transloco="let t">
      <div class="table-container">
        <p-table
          #packagesTable
          [value]="adminService.packages()?.items ?? []"
          [rows]="pagination.perPage()"
          [paginator]="true"
          [lazy]="true"
          [totalRecords]="adminService.packagesTotal()"
          [showCurrentPageReport]="true"
          [rowsPerPageOptions]="[25, 50, 100]"
          (onLazyLoad)="onLazyLoad(packagesTable, $event)"
          dataKey="id"
          stateStorage="local"
          stateKey="admin-packages-table"
          paginatorDropdownAppendTo="body"
        >
          <ng-template #caption>
            <div class="flex flex-col gap-2.5 sm:flex-row sm:flex-nowrap sm:items-center">
              <div class="flex w-full sm:hidden">
                <p-button
                  class="w-full"
                  [label]="t('admin.packages.addPackage')"
                  (onClick)="openAddAurDialog()"
                  styleClass="w-full justify-center"
                  icon="pi pi-plus"
                  text
                  severity="primary"
                />
              </div>
              <div class="hidden sm:ml-auto sm:flex sm:flex-wrap sm:items-center sm:gap-2.5">
                <p-button
                  [label]="t('admin.packages.addPackage')"
                  (onClick)="openAddAurDialog()"
                  icon="pi pi-plus"
                  text
                  severity="primary"
                />
                <p-select
                  [options]="adminService.repos() ?? []"
                  [ngModel]="adminService.packageRepoFilter()"
                  [placeholder]="t('admin.packages.allRepos')"
                  (ngModelChange)="onRepoChange($event)"
                  optionLabel="name"
                  optionValue="id"
                  showClear
                  appendTo="body"
                />
                <p-select
                  [options]="adminService.activeOptions()"
                  [ngModel]="adminService.packageActiveFilter()"
                  [placeholder]="t('admin.pages.activeStatus')"
                  (ngModelChange)="onActiveChange($event)"
                  optionLabel="label"
                  optionValue="value"
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
                  [placeholder]="t('admin.pages.searchPkgname')"
                  (input)="onSearch($event)"
                  pInputText
                  type="text"
                />
              </p-iconfield>
            </div>
          </ng-template>
          <ng-template #header>
            <tr>
              <th style="min-width: 3rem">{{ t('admin.pages.columns.id') }}</th>
              <th style="min-width: 12rem">{{ t('admin.pages.columns.name') }}</th>
              <th style="min-width: 8rem">{{ t('admin.pages.columns.version') }}</th>
              <th style="min-width: 6rem">{{ t('admin.pages.columns.repo') }}</th>
              <th style="min-width: 8rem">{{ t('admin.packages.columns.pkgbase') }}</th>
              <th style="min-width: 7rem">{{ t('admin.packages.columns.buildClass') }}</th>
              <th style="min-width: 6rem">{{ t('admin.pages.active') }}</th>
              <th class="cell-actions">
                <span class="sr-only">{{ t('admin.pages.columns.actions') }}</span>
              </th>
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
                <div class="flex flex-col gap-0.5">
                  @if (pkg.buildClass !== null && pkg.buildClass !== undefined) {
                    <span
                      [pTooltip]="buildClassMismatchTooltip(pkg)"
                      [class.text-ctp-red]="hasBuildClassMismatch(pkg)"
                      tooltipPosition="left"
                      >{{ pkg.buildClass | buildClass }}</span
                    >
                  } @else {
                    <span class="text-ctp-subtext0">{{ t('admin.packages.buildClass.unset') }}</span>
                  }
                  @if (pkg.buildClassSuggestion; as suggestion) {
                    @if (suggestion.suggestedBuildClass !== null) {
                      <span
                        class="text-xs text-ctp-overlay1"
                        [pTooltip]="buildClassSuggestionTooltip(suggestion)"
                        tooltipPosition="left"
                        >{{
                          t('admin.packages.buildClass.suggested', {
                            buildClass: (suggestion.suggestedBuildClass | buildClass),
                          })
                        }}</span
                      >
                    }
                  }
                </div>
              </td>
              <td>
                @if (pkg.isActive) {
                  <p-tag [value]="t('admin.pages.active')" severity="success" />
                } @else {
                  <p-tag [value]="t('admin.pages.inactive')" severity="secondary" />
                }
                @if (pkg.failureSilenced) {
                  <p-tag
                    [value]="t('admin.packages.silenced.label')"
                    [pTooltip]="t('admin.packages.silenced.tooltip')"
                    severity="warn"
                    tooltipPosition="left"
                  />
                }
              </td>
              <td class="cell-actions">
                <div class="flex flex-nowrap items-center justify-end gap-1">
                  <button
                    class="chaotic-icon-btn"
                    [attr.aria-label]="t('admin.pages.editAriaLabel', { name: pkg.pkgname })"
                    [pTooltip]="t('common.edit')"
                    (click)="openEdit(pkg)"
                    type="button"
                    tooltipPosition="left"
                  >
                    <i class="pi pi-pencil" aria-hidden="true"></i>
                  </button>
                  <button
                    class="chaotic-icon-btn"
                    [attr.aria-label]="t('admin.packages.moreActionsAriaLabel', { name: pkg.pkgname })"
                    (click)="openRowMenu(rowMenu, $event, pkg)"
                    aria-haspopup="menu"
                    type="button"
                  >
                    <i class="pi pi-ellipsis-v" aria-hidden="true"></i>
                  </button>
                </div>
              </td>
            </tr>
          </ng-template>
          <ng-template #emptymessage>
            @if (adminService.packagesLoading()) {
              <chaotic-table-skeleton-rows
                [rowHeight]="rowHeights.adminPackages"
                [rows]="pagination.perPage()"
                [columns]="8"
              />
            } @else {
              <tr>
                <td [attr.colspan]="8">
                  <p class="chaotic-card__empty">{{ t('admin.packages.empty') }}</p>
                </td>
              </tr>
            }
          </ng-template>
        </p-table>
      </div>

      <p-menu #rowMenu [model]="rowMenuItems()" [popup]="true" appendTo="body" styleClass="row-menu" />

      <p-dialog
        [(visible)]="dialogVisible"
        [modal]="true"
        [appendTo]="'body'"
        [style]="{ 'width': '64rem', 'max-width': '94vw' }"
        [header]="t('admin.packages.editDialog.header')"
      >
        <form class="flex flex-col gap-4" (submit)="save(); $event.preventDefault()">
          <label class="flex flex-col gap-1">
            <span class="text-ctp-text text-sm">{{ t('admin.pages.form.packageName') }}</span>
            <input [formField]="packageForm.pkgname" pInputText type="text" />
            @if (packageForm.pkgname().touched() && packageForm.pkgname().errors().length) {
              <span class="text-ctp-red text-xs">{{ t('admin.pages.form.packageNameRequired') }}</span>
            }
          </label>
          <div class="flex flex-wrap gap-4">
            <label class="flex flex-1 flex-col gap-1">
              <span class="text-ctp-text text-sm">{{ t('admin.pages.columns.version') }}</span>
              <input [formField]="packageForm.version" pInputText type="text" />
            </label>
            <label class="flex flex-1 flex-col gap-1">
              <span class="text-ctp-text text-sm">{{ t('admin.pages.form.pkgrel') }}</span>
              <input [formField]="packageForm.pkgrel" pInputText type="text" inputmode="numeric" />
            </label>
            <label class="flex flex-1 flex-col gap-1">
              <span class="text-ctp-text text-sm">{{ t('admin.packages.bump.label') }}</span>
              <input [formField]="packageForm.bump" pInputText type="text" inputmode="numeric" />
            </label>
          </div>
          <div class="flex flex-col gap-1">
            <span class="text-ctp-text text-sm">{{ t('admin.pages.columns.repo') }}</span>
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
              <label class="text-ctp-text text-sm" for="pkgIsActive">{{ t('admin.pages.active') }}</label>
            </div>
            <div class="flex items-center gap-2">
              <p-checkbox [formField]="packageForm.skipSignalScan" [binary]="true" inputId="pkgSkipScan" />
              <label class="text-ctp-text text-sm" for="pkgSkipScan">{{
                t('admin.packages.editDialog.skipSignalScan')
              }}</label>
            </div>
            <div class="flex items-center gap-2">
              <p-checkbox
                [formField]="packageForm.failureSilenced"
                [binary]="true"
                [pTooltip]="t('admin.packages.editDialog.silenceFailedBuildTooltip')"
                inputId="pkgFailureSilenced"
                tooltipPosition="top"
              />
              <label
                class="text-ctp-text text-sm cursor-help"
                [pTooltip]="t('admin.packages.editDialog.silenceFailedBuildTooltip')"
                for="pkgFailureSilenced"
                tooltipPosition="top"
              >
                {{ t('admin.packages.editDialog.silenceFailedBuild') }}
              </label>
            </div>
          </div>
          <div class="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <p-button
              [label]="t('common.cancel')"
              (onClick)="dialogVisible.set(false)"
              type="button"
              severity="secondary"
              text
              size="small"
              styleClass="w-full sm:w-auto"
            />
            <p-button
              [disabled]="packageForm().invalid()"
              [label]="t('common.save')"
              type="submit"
              severity="primary"
              size="small"
              styleClass="w-full sm:w-auto"
            />
          </div>
        </form>
      </p-dialog>

      <p-dialog
        [(visible)]="addAurDialogVisible"
        [header]="t('admin.packages.addDialog.header')"
        [modal]="true"
        [style]="{ width: '90vw', maxWidth: '800px' }"
        appendTo="body"
      >
        <div class="flex flex-col gap-4 py-2">
          <div class="flex flex-col gap-4">
            <div class="flex flex-col gap-1.5">
              <div class="flex items-center justify-between">
                <span class="font-medium text-ctp-text text-sm">{{ t('admin.pages.form.packageName') }}</span>
                @if (aurPackageName() && !isAurMissing()) {
                  <a
                    class="font-medium text-ctp-mauve text-sm hover:underline flex items-center gap-1"
                    [href]="'https://aur.archlinux.org/packages/' + aurPackageName()"
                    [pTooltip]="t('admin.packages.addDialog.openAurPage')"
                    target="_blank"
                    rel="noopener"
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
                [placeholder]="t('admin.packages.addDialog.searchPlaceholder')"
                (ngModelChange)="aurSearchModel.set({ query: $event })"
                (completeMethod)="searchAurSuggestions($event)"
                (onBlur)="confirmAurPackage()"
                (onSelect)="confirmAurPackage()"
                appendTo="body"
              />
              @if (aurPackageName()) {
                @if (isExistingPackage()) {
                  <small class="text-ctp-red font-medium">{{
                    t('admin.packages.addDialog.alreadyExists', { name: aurPackageName() })
                  }}</small>
                } @else if (isAurMissing()) {
                  <small class="text-ctp-red font-medium">{{
                    t('admin.packages.addDialog.notInAur', { name: aurPackageName() })
                  }}</small>
                }
              }
            </div>

            @if (aurPackageName() && !isExistingPackage() && !isAurMissing()) {
              <chaotic-aur-scan-result [packageName]="aurPackageName()" />
            }

            <div class="flex flex-col gap-3 border-t border-ctp-surface0 pt-3 mt-1">
              <h4 class="text-ctp-text font-semibold text-sm">{{ t('admin.packages.addDialog.requestDetails') }}</h4>
              <label class="flex flex-col gap-1">
                <span class="text-ctp-text text-sm">{{ t('admin.packages.addDialog.requestOrigin') }}</span>
                <input
                  [ngModel]="aurRequestOrigin()"
                  (ngModelChange)="aurRequestOrigin.set($event)"
                  pInputText
                  placeholder="github/5678,chaotic/xiota,forum/tne"
                  type="text"
                />
              </label>
              <div class="flex flex-col gap-2">
                <span class="text-ctp-text text-sm">{{ t('admin.packages.addDialog.requestReason') }}</span>
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
                      <span class="text-ctp-subtext0 text-[11px] leading-tight">{{ t(card.descriptionKey) }}</span>
                    </button>
                  }
                </div>
              </div>
              <label class="flex flex-col gap-1">
                <span class="text-ctp-text text-sm">{{ t('admin.packages.addDialog.customRequestReason') }}</span>
                <input
                  [ngModel]="aurCustomRequestReason()"
                  [placeholder]="t('admin.packages.addDialog.customRequestReasonPlaceholder')"
                  (ngModelChange)="aurCustomRequestReason.set($event)"
                  pInputText
                  type="text"
                />
              </label>
            </div>
          </div>

          <div class="flex flex-row items-center justify-end gap-2 mt-6 pt-4 border-t border-ctp-surface0/50">
            <p-button
              class="flex-1 sm:flex-initial"
              [label]="t('common.cancel')"
              (onClick)="addAurDialogVisible.set(false)"
              styleClass="w-full justify-center sm:w-auto"
              type="button"
              severity="secondary"
              text
              size="small"
            />
            <p-button
              class="flex-1 sm:flex-initial"
              [disabled]="!canAddAurPackage()"
              [icon]="isScanOngoing() || isAdding() ? 'pi pi-spinner pi-spin' : 'pi pi-plus-circle'"
              [label]="t('admin.packages.addDialog.submit')"
              (onClick)="triggerAddAurPackage()"
              styleClass="w-full justify-center sm:w-auto"
              type="button"
              severity="primary"
              size="small"
            />
          </div>
        </div>
      </p-dialog>
    </ng-container>
  `,
})
export class AdminPackagesPageComponent {
  private readonly aurScanService = inject(AurScanService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);

  protected readonly adminService = inject(AdminService);

  private readonly activeTranslation = injectActiveTranslation();

  protected readonly rowHeights = TABLE_ROW_HEIGHTS;
  protected readonly formatPkgrel = formatPkgrel;

  private readonly rowMenuTarget = signal<PackageDto | null>(null);

  protected readonly rowMenuItems = computed<MenuItem[]>(() => {
    this.activeTranslation();

    const pkg = this.rowMenuTarget();
    if (!pkg) return [];

    return [
      {
        label: this.transloco.translate('admin.packages.rowMenu.build'),
        items: [
          {
            label: this.transloco.translate('admin.packages.bump.label'),
            icon: 'pi pi-arrow-up',
            command: () => this.bumpPackage(pkg),
          },
          {
            label: this.transloco.translate('admin.packages.rowMenu.scheduleBuild'),
            icon: 'pi pi-calendar-plus',
            command: () => this.schedulePackage(pkg),
          },
          {
            label: this.transloco.translate('admin.pages.rescanElf.label'),
            icon: 'pi pi-refresh',
            command: () => this.rescanPackage(pkg),
          },
          {
            label: this.transloco.translate('admin.packages.adjustBuildClass.header'),
            icon: 'pi pi-sliders-h',
            command: () => this.adjustBuildClass(pkg),
          },
        ],
      },
      {
        label: this.transloco.translate('admin.packages.rowMenu.dangerZone'),
        items: [
          {
            label: this.transloco.translate('admin.packages.rowMenu.dropFromRepository'),
            icon: 'pi pi-minus-circle',
            styleClass: 'row-menu__danger',
            command: () => this.dropPackage(pkg),
          },
          {
            label: this.transloco.translate('admin.packages.rowMenu.deleteRecord'),
            icon: 'pi pi-trash',
            styleClass: 'row-menu__danger',
            command: () => this.confirmDelete(pkg),
          },
        ],
      },
    ];
  });

  protected openRowMenu(menu: Menu, event: Event, pkg: PackageDto): void {
    this.rowMenuTarget.set(pkg);
    menu.toggle(event);
  }

  protected buildClassSuggestionTooltip(suggestion: BuildClassSuggestion): string {
    const { samples, averages } = suggestion;
    const buildCount =
      samples === 1
        ? this.transloco.translate('admin.packages.buildClass.buildCountOne', { count: samples })
        : this.transloco.translate('admin.packages.buildClass.buildCountOther', { count: samples });

    const metrics = [
      averages.avgPeakMemoryBytes != null
        ? this.transloco.translate('admin.packages.buildClass.peakMemory', {
            value: formatBytes(averages.avgPeakMemoryBytes),
          })
        : null,
      averages.avgCpuTimeNs != null
        ? this.transloco.translate('admin.packages.buildClass.cpuTime', { value: formatCpuTime(averages.avgCpuTimeNs) })
        : null,
      averages.avgDiskIoBytes != null
        ? this.transloco.translate('admin.packages.buildClass.diskIo', { value: formatBytes(averages.avgDiskIoBytes) })
        : null,
      averages.avgDurationSeconds != null
        ? this.transloco.translate('admin.packages.buildClass.duration', {
            value: formatDuration(averages.avgDurationSeconds),
          })
        : null,
    ].filter((part) => part !== null);

    return [buildCount, ...metrics].join(' · ');
  }

  protected hasBuildClassMismatch(pkg: PackageDto): boolean {
    const suggested = pkg.buildClassSuggestion?.suggestedBuildClass;
    if (suggested === null || suggested === undefined) return false;
    return pkg.buildClass !== suggested;
  }

  protected buildClassMismatchTooltip(pkg: PackageDto): string {
    if (!this.hasBuildClassMismatch(pkg)) {
      return this.transloco.translate('admin.packages.buildClass.matchesSuggestion');
    }

    const suggested = pkg.buildClassSuggestion?.suggestedBuildClass;
    if (suggested === undefined || suggested === null) {
      return this.transloco.translate('admin.packages.buildClass.noSamples');
    }

    return this.transloco.translate('admin.packages.buildClass.suggestsClass', { buildClass: suggested });
  }

  readonly pagination = createAdminPagination({ router: this.router, route: this.route });

  readonly dialogVisible = signal(false);
  readonly editing = signal<PackageDto | null>(null);

  private readonly syncSearch = createDebounced(400, () =>
    patchQueryParams(this.router, this.route, { q: queryToQuery(this.adminService.packageQuery()) }),
  );

  protected readonly model = signal<PackageFormModel>(emptyModel());
  readonly packageForm = form(this.model, (s) => {
    required(s.pkgname);
  });

  readonly repoOptions = computed(() => {
    this.activeTranslation();

    return [
      { label: this.transloco.translate('admin.packages.editDialog.noRepo'), value: NO_REPO },
      ...(this.adminService.repos() ?? []).map((repo) => ({ label: repo.name, value: String(repo.id) })),
    ];
  });

  protected readonly aurSearchModel = signal({ query: '' });
  protected readonly AUR_SUGGEST_DEBOUNCE_MS = 400;
  protected readonly aurSearchForm = form(this.aurSearchModel, (schemaPath) => {
    debounce(schemaPath.query, 500);
    pattern(schemaPath.query, PIPELINE_PKG_BASE_REGEX);
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
    descriptionKey: REQUEST_REASON_DESCRIPTION_KEYS[reason],
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
    this.adminService.useLists(['packages', 'repos']);
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
      message: this.transloco.translate('admin.packages.deleteConfirm.message', { pkgname: pkg.pkgname }),
      header: this.transloco.translate('admin.packages.deleteConfirm.header'),
      acceptLabel: this.transloco.translate('common.delete'),
      rejectLabel: this.transloco.translate('common.cancel'),
      accept: () => void this.adminService.deletePackage(pkg.id),
    });
  }

  bumpPackage(pkg: PackageDto): void {
    this.confirmationService.confirm({
      message: this.transloco.translate('admin.packages.bump.confirmMessage', { pkgname: pkg.pkgname }),
      header: this.transloco.translate('admin.packages.bump.confirmHeader'),
      acceptLabel: this.transloco.translate('admin.packages.bump.label'),
      rejectLabel: this.transloco.translate('common.cancel'),
      accept: () => void this.adminService.bumpPackages([pkg.pkgname], pkg.reponame),
    });
  }

  schedulePackage(pkg: PackageDto): void {
    this.confirmationService.confirm({
      message: this.transloco.translate('admin.packages.schedule.confirmMessage', { pkgname: pkg.pkgname }),
      header: this.transloco.translate('admin.packages.schedule.confirmHeader'),
      acceptLabel: this.transloco.translate('admin.packages.schedule.accept'),
      rejectLabel: this.transloco.translate('common.cancel'),
      accept: () => void this.adminService.schedulePackages([pkg]),
    });
  }

  rescanPackage(pkg: PackageDto): void {
    this.confirmationService.confirm({
      message: this.transloco.translate('admin.pages.rescanElf.confirmMessage', { pkgname: pkg.pkgname }),
      header: this.transloco.translate('admin.pages.rescanElf.label'),
      acceptLabel: this.transloco.translate('admin.pages.rescanElf.accept'),
      rejectLabel: this.transloco.translate('common.cancel'),
      accept: () => void this.adminService.rescanPackage(pkg.pkgname, PKG_TYPE_CHAOTIC),
    });
  }

  adjustBuildClass(pkg: PackageDto): void {
    const pkgbase = pkg.pkgbaseName ?? pkg.pkgname;
    const suggested = pkg.buildClassSuggestion?.suggestedBuildClass;
    const suggestionText =
      suggested !== null && suggested !== undefined
        ? String(suggested)
        : this.transloco.translate('admin.packages.adjustBuildClass.noSuggestion');

    this.confirmationService.confirm({
      message: this.transloco.translate('admin.packages.adjustBuildClass.confirmMessage', {
        pkgname: pkg.pkgname,
        suggestion: suggestionText,
        pkgbase,
      }),
      header: this.transloco.translate('admin.packages.adjustBuildClass.header'),
      acceptLabel: this.transloco.translate('admin.packages.adjustBuildClass.accept'),
      rejectLabel: this.transloco.translate('common.cancel'),
      accept: () => void this.adminService.adjustBuildClass(pkg),
    });
  }

  dropPackage(pkg: PackageDto): void {
    this.confirmationService.confirm({
      message: this.transloco.translate('admin.packages.drop.confirmMessage', { pkgname: pkg.pkgname }),
      header: this.transloco.translate('admin.packages.drop.confirmHeader'),
      acceptLabel: this.transloco.translate('admin.packages.drop.accept'),
      rejectLabel: this.transloco.translate('common.cancel'),
      accept: () => void this.adminService.dropPackages([pkg.pkgname], pkg.reponame),
    });
  }

  onLazyLoad(table: StatefulTableRef, event: { first?: number; rows?: number | null }): void {
    this.pagination.handleStatefulLazyLoad(table, event);
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
