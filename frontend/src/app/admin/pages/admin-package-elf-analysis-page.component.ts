import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FormField, form, pattern, required, submit } from '@angular/forms/signals';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { AdminPackageElfAnalysis } from '@chaotic-next/shared-lib';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { ConfirmationService } from '@openng/optimus-ui/api';
import { Button } from '@openng/optimus-ui/button';
import { Checkbox } from '@openng/optimus-ui/checkbox';
import { Dialog } from '@openng/optimus-ui/dialog';
import { IconField } from '@openng/optimus-ui/iconfield';
import { InputIcon } from '@openng/optimus-ui/inputicon';
import { InputText } from '@openng/optimus-ui/inputtext';
import { ProgressSpinner } from '@openng/optimus-ui/progressspinner';
import { Select } from '@openng/optimus-ui/select';
import { TableModule } from '@openng/optimus-ui/table';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { injectActiveTranslation } from '../../i18n/active-translation';
import { PackageTriggerSourcesComponent } from '../../package-trigger-sources/package-trigger-sources.component';
import { AdminService, ElfAnalysisFormData } from '../admin.service';
import {
  createAdminPagination,
  type StatefulTableRef,
  createDebounced,
  patchQueryParams,
  queryFromRaw,
  queryToQuery,
  restoreQueryParams,
} from '../admin-url-sync';
import { TABLE_ROW_HEIGHTS } from '../../table-skeleton/table-row-heights';
import { TableSkeletonRowsComponent } from '../../table-skeleton/table-skeleton-rows.component';

interface ElfAnalysisFormModel {
  pkgType: '0' | '1';
  pkgId: string;
  version: string;
  broken: boolean;
  brokenReasons: string;
}

const PKG_TYPE_LABELS = { '0': 'Arch', '1': 'Chaotic' } as const;
const PKG_TYPE_OPTIONS = Object.entries(PKG_TYPE_LABELS).map(([value, label]) => ({ label, value }));

@Component({
  selector: 'chaotic-admin-package-elf-analysis-page',
  imports: [
    TableSkeletonRowsComponent,
    DatePipe,
    Button,
    Checkbox,
    Dialog,
    FormField,
    FormsModule,
    IconField,
    InputIcon,
    InputText,
    PackageTriggerSourcesComponent,
    ProgressSpinner,
    RouterLink,
    Select,
    TableModule,
    Tooltip,
    TranslocoDirective,
  ],
  template: `
    <ng-container *transloco="let t">
      <div class="table-container">
        <p-table
          #elfAnalysisTable
          [value]="service.elfAnalysis()?.items ?? []"
          [rows]="pagination.perPage()"
          [paginator]="true"
          [lazy]="true"
          [totalRecords]="service.elfAnalysisTotal()"
          [showCurrentPageReport]="true"
          [rowsPerPageOptions]="[25, 50, 100]"
          (onLazyLoad)="onLazyLoad(elfAnalysisTable, $event)"
          dataKey="id"
          stateStorage="local"
          stateKey="admin-elf-analysis-table"
          paginatorDropdownAppendTo="body"
        >
          <ng-template #caption>
            <div class="flex flex-col gap-2.5 sm:flex-row sm:flex-nowrap sm:items-center">
              <div class="hidden sm:ml-auto sm:flex sm:flex-wrap sm:items-center sm:gap-2.5">
                <p-select
                  [options]="pkgTypeOptions"
                  [ngModel]="service.elfAnalysisPkgTypeFilter()"
                  [placeholder]="t('admin.elfAnalysis.packageType')"
                  (ngModelChange)="setPkgTypeFilter($event)"
                  optionLabel="label"
                  optionValue="value"
                  showClear
                  appendTo="body"
                />
                <p-select
                  [options]="brokenOptions()"
                  [ngModel]="service.elfAnalysisBrokenFilter()"
                  [placeholder]="t('admin.elfAnalysis.status.broken')"
                  (ngModelChange)="setBrokenFilter($event)"
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
                  [value]="service.elfAnalysisQuery()"
                  [placeholder]="t('admin.elfAnalysis.searchPlaceholder')"
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
              <th style="min-width: 12rem">{{ t('admin.pages.columns.package') }}</th>
              <th style="min-width: 8rem">{{ t('admin.pages.columns.version') }}</th>
              <th style="min-width: 8rem">{{ t('admin.elfAnalysis.columns.binary') }}</th>
              <th style="min-width: 14rem">{{ t('admin.elfAnalysis.columns.status') }}</th>
              <th style="min-width: 7rem">{{ t('admin.elfAnalysis.columns.scanned') }}</th>
              <th class="cell-actions">
                <span class="sr-only">{{ t('admin.pages.columns.actions') }}</span>
              </th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-row>
            <tr>
              <td>{{ row.id }}</td>
              <td>
                <div class="flex flex-col gap-0.5">
                  @if (row.pkgname) {
                    <a
                      class="cursor-pointer font-mono text-[0.8125rem] text-ctp-text hover:text-ctp-mauve"
                      [routerLink]="packageLink(row)"
                      [queryParams]="{ q: row.pkgname }"
                    >
                      {{ row.pkgname }}
                    </a>
                  }
                  <span class="text-xs text-ctp-overlay1">{{ pkgTypeLabel(row.pkgType) }} · #{{ row.pkgId }}</span>
                </div>
              </td>
              <td>{{ row.version }}</td>
              <td class="text-ctp-subtext1">{{ t(binaryLabelKey(row)) }}</td>
              <td>
                <div class="flex flex-col gap-0.5">
                  <span class="inline-flex items-center gap-2">
                    <span
                      class="h-1.5 w-1.5 shrink-0 rounded-full"
                      [class.bg-ctp-red]="row.broken"
                      [class.bg-ctp-green]="!row.broken"
                      aria-hidden="true"
                    ></span>
                    @if (row.broken) {
                      {{ t('admin.elfAnalysis.status.broken') }}
                    } @else {
                      {{ t('admin.elfAnalysis.status.ok') }}
                    }
                  </span>
                  @if (row.broken && row.brokenReasons?.length) {
                    <span class="line-clamp-2 text-xs text-ctp-overlay1" [title]="row.brokenReasons.join(', ')">{{
                      row.brokenReasons.join(', ')
                    }}</span>
                  }
                </div>
              </td>
              <td>{{ row.scannedAt | date: 'short' }}</td>
              <td class="cell-actions">
                <div class="flex items-center justify-end gap-1">
                  <button
                    class="chaotic-icon-btn"
                    [attr.aria-label]="t('admin.pages.editAriaLabel', { name: row.pkgname })"
                    [pTooltip]="t('common.edit')"
                    (click)="openEdit(row)"
                    type="button"
                    tooltipPosition="left"
                  >
                    <i class="pi pi-pencil" aria-hidden="true"></i>
                  </button>
                  <button
                    class="chaotic-icon-btn chaotic-icon-btn--danger"
                    [attr.aria-label]="t('admin.pages.deleteAriaLabel', { name: row.pkgname })"
                    [pTooltip]="t('common.delete')"
                    (click)="confirmDelete(row)"
                    type="button"
                    tooltipPosition="left"
                  >
                    <i class="pi pi-trash" aria-hidden="true"></i>
                  </button>
                </div>
              </td>
            </tr>
          </ng-template>
          <ng-template #emptymessage>
            @if (service.elfAnalysisLoading()) {
              <chaotic-table-skeleton-rows
                [rowHeight]="rowHeights.adminElfAnalysis"
                [rows]="pagination.perPage()"
                [columns]="7"
              />
            } @else {
              <tr>
                <td [attr.colspan]="7">
                  <p class="chaotic-card__empty">{{ t('admin.elfAnalysis.empty') }}</p>
                </td>
              </tr>
            }
          </ng-template>
        </p-table>
      </div>

      <p-dialog
        [(visible)]="dialogVisible"
        [modal]="true"
        [appendTo]="'body'"
        [style]="{ 'width': '64rem', 'max-width': '94vw' }"
        [header]="t('admin.elfAnalysis.editDialog.header')"
      >
        <form class="flex flex-col gap-4" (submit)="save(); $event.preventDefault()">
          <div class="flex flex-wrap gap-4">
            <div class="flex flex-1 flex-col gap-1">
              <span class="text-ctp-text text-sm">{{ t('admin.elfAnalysis.packageType') }}</span>
              <p-select
                [ngModel]="model().pkgType"
                [ngModelOptions]="{ standalone: true }"
                [options]="pkgTypeOptions"
                (ngModelChange)="setPkgType($event)"
                optionLabel="label"
                optionValue="value"
                appendTo="body"
              />
            </div>
            <label class="flex flex-1 flex-col gap-1">
              <span class="text-ctp-text text-sm">{{ t('admin.elfAnalysis.editDialog.packageId') }}</span>
              <input [formField]="elfForm.pkgId" pInputText type="text" inputmode="numeric" />
            </label>
          </div>
          <label class="flex flex-col gap-1">
            <span class="text-ctp-text text-sm">{{ t('admin.pages.columns.version') }}</span>
            <input [formField]="elfForm.version" pInputText type="text" />
            @if (elfForm.version().touched() && elfForm.version().errors().length) {
              <span class="text-ctp-red text-xs">{{ t('admin.elfAnalysis.editDialog.versionRequired') }}</span>
            }
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-ctp-text text-sm">{{ t('admin.elfAnalysis.editDialog.brokenReasons') }}</span>
            <input [formField]="elfForm.brokenReasons" pInputText type="text" />
            <span class="text-ctp-subtext text-xs">{{ t('admin.elfAnalysis.editDialog.brokenReasonsHint') }}</span>
          </label>
          <div class="flex items-center gap-2">
            <p-checkbox [formField]="elfForm.broken" [binary]="true" inputId="elfBroken" />
            <label class="text-ctp-text text-sm" for="elfBroken">{{ t('admin.elfAnalysis.status.broken') }}</label>
          </div>
          <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div class="flex flex-col gap-2">
              <span class="text-ctp-text text-sm">{{ t('admin.elfAnalysis.editDialog.rebuildTriggers') }}</span>
              @if (service.elfAnalysisBumpsLoading()) {
                <p-progress-spinner
                  [style]="{ width: '24px', height: '24px' }"
                  [ariaLabel]="t('admin.elfAnalysis.editDialog.loadingRebuildTriggers')"
                  strokeWidth="4"
                />
              } @else if (!service.elfAnalysisBumps() || service.elfAnalysisBumps()?.length === 0) {
                <span class="text-ctp-subtext text-xs">{{ t('admin.elfAnalysis.editDialog.noRebuildTriggers') }}</span>
              } @else {
                <ul class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  @for (bump of service.elfAnalysisBumps()!; track bump.id) {
                    <li class="flex flex-col rounded border border-ctp-surface1 bg-ctp-base px-3 py-2">
                      <span class="text-ctp-text text-sm">
                        {{ bump.pkgname || '#' + bump.trigger }}
                        @if (bump.triggerName) {
                          <span class="text-ctp-subtext">{{
                            t('admin.elfAnalysis.editDialog.triggeredBy', { name: bump.triggerName })
                          }}</span>
                        }
                      </span>
                      <span class="text-ctp-subtext text-xs">{{ bump.timestamp | date: 'short' }}</span>
                      @if (bump.details?.length) {
                        <span class="text-ctp-subtext text-xs">{{ bump.details!.join(', ') }}</span>
                      }
                    </li>
                  }
                </ul>
              }
            </div>
            <div class="flex flex-col gap-1">
              <span class="text-ctp-text text-sm">{{ t('admin.elfAnalysis.editDialog.rebuildTriggerSources') }}</span>
              <chaotic-package-trigger-sources [pkgname]="editing()?.pkgname" />
            </div>
          </div>
          <div class="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <p-button
              [label]="t('common.cancel')"
              (onClick)="closeDialog()"
              type="button"
              severity="secondary"
              text
              size="small"
              styleClass="w-full sm:w-auto"
            />
            <p-button
              [disabled]="elfForm().invalid()"
              [label]="t('common.save')"
              type="submit"
              severity="primary"
              size="small"
              styleClass="w-full sm:w-auto"
            />
          </div>
        </form>
      </p-dialog>
    </ng-container>
  `,
})
export class AdminPackageElfAnalysisPageComponent {
  readonly service = inject(AdminService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly transloco = inject(TranslocoService);
  private readonly activeTranslation = injectActiveTranslation();
  protected readonly rowHeights = TABLE_ROW_HEIGHTS;

  readonly pagination = createAdminPagination({ router: this.router, route: this.route });

  readonly dialogVisible = signal(false);
  readonly editing = signal<AdminPackageElfAnalysis | null>(null);

  readonly pkgTypeOptions = PKG_TYPE_OPTIONS;
  readonly brokenOptions = computed(() => {
    this.activeTranslation();

    return [
      { label: this.transloco.translate('admin.elfAnalysis.status.broken'), value: true },
      { label: this.transloco.translate('admin.elfAnalysis.status.ok'), value: false },
    ];
  });

  /** Human-readable package type for table cells. Unknown values pass through. */
  protected pkgTypeLabel(type: string): string {
    return PKG_TYPE_LABELS[type as keyof typeof PKG_TYPE_LABELS] ?? type;
  }

  protected binaryLabelKey(row: AdminPackageElfAnalysis): string {
    if (!row.hasCompiledCode) {
      return marker('admin.elfAnalysis.binary.none');
    }

    if (row.isSourceCompiled) {
      return marker('admin.elfAnalysis.binary.fromSource');
    }

    return marker('admin.elfAnalysis.binary.prebuilt');
  }

  private readonly syncSearch = createDebounced(400, () =>
    patchQueryParams(this.router, this.route, { q: queryToQuery(this.service.elfAnalysisQuery()) }),
  );

  constructor() {
    this.service.useLists(['elfAnalysis']);
    this.pagination.restoreFromQuery(this.route);
    this.service.elfAnalysisPage.set(this.pagination.page());
    this.service.elfAnalysisPerPage.set(this.pagination.perPage());
    restoreQueryParams(this.route, {
      q: (raw) => this.service.elfAnalysisQuery.set(queryFromRaw(raw)),
      pkgType: (raw) => this.service.elfAnalysisPkgTypeFilter.set(raw === '0' || raw === '1' ? raw : undefined),
      broken: (raw) => this.service.elfAnalysisBrokenFilter.set(raw === null ? undefined : raw === 'true'),
    });
  }

  protected readonly model = signal<ElfAnalysisFormModel>(emptyModel());
  readonly elfForm = form(this.model, (s) => {
    required(s.version);
    required(s.pkgId);
    pattern(s.pkgId, /^\d+$/);
  });

  packageLink(row: AdminPackageElfAnalysis): string[] {
    return row.pkgType === '0' ? ['/admin/arch'] : ['/admin/packages'];
  }

  openEdit(row: AdminPackageElfAnalysis): void {
    this.editing.set(row);
    this.service.setElfAnalysisBumpsFor(row.id);
    this.model.set({
      pkgType: row.pkgType,
      pkgId: String(row.pkgId),
      version: row.version,
      broken: row.broken,
      brokenReasons: row.brokenReasons?.join(', ') ?? '',
    });
    this.dialogVisible.set(true);
  }

  setPkgType(value: string | null | undefined): void {
    if (value !== null && value !== undefined) {
      this.model.update((model) => ({ ...model, pkgType: value as '0' | '1' }));
    }
  }

  save(): void {
    submit(this.elfForm, async () => {
      const data = this.toFormData(this.model());
      const current = this.editing();
      if (current) await this.service.updateElfAnalysis(current.id, data);
      this.closeDialog();
    });
  }

  closeDialog(): void {
    this.service.setElfAnalysisBumpsFor(undefined);
    this.dialogVisible.set(false);
  }

  confirmDelete(row: AdminPackageElfAnalysis): void {
    this.confirmationService.confirm({
      message: this.transloco.translate('admin.elfAnalysis.deleteConfirm.message', {
        id: row.id,
        version: row.version,
      }),
      header: this.transloco.translate('admin.elfAnalysis.deleteConfirm.header'),
      acceptLabel: this.transloco.translate('common.delete'),
      rejectLabel: this.transloco.translate('common.cancel'),
      accept: () => void this.service.deleteElfAnalysis(row.id),
    });
  }

  setPkgTypeFilter(value: string | null | undefined): void {
    this.service.elfAnalysisPkgTypeFilter.set(value === null || value === undefined ? undefined : (value as '0' | '1'));
    this.pagination.resetPage();
    patchQueryParams(this.router, this.route, {
      pkgType: value === null || value === undefined ? null : (value as '0' | '1'),
    });
  }

  setBrokenFilter(value: boolean | null | undefined): void {
    this.service.elfAnalysisBrokenFilter.set(value === null || value === undefined ? undefined : value);
    this.pagination.resetPage();
    patchQueryParams(this.router, this.route, {
      broken: value === null || value === undefined ? null : String(value),
    });
  }

  onLazyLoad(table: StatefulTableRef, event: { first?: number; rows?: number | null }): void {
    this.pagination.handleStatefulLazyLoad(table, event);
    this.service.elfAnalysisPage.set(this.pagination.page());
    this.service.elfAnalysisPerPage.set(event.rows ?? 25);
  }

  onSearch(event: Event): void {
    this.service.elfAnalysisQuery.set((event.target as HTMLInputElement).value);
    this.pagination.resetPage();
    this.syncSearch();
  }

  private toFormData(model: ElfAnalysisFormModel): ElfAnalysisFormData {
    return {
      pkgType: model.pkgType,
      pkgId: Number(model.pkgId),
      version: model.version,
      broken: model.broken,
      brokenReasons: model.brokenReasons
        .split(',')
        .map((reason) => reason.trim())
        .filter((reason) => reason.length > 0),
    };
  }
}

function emptyModel(): ElfAnalysisFormModel {
  return { pkgType: '0', pkgId: '', version: '', broken: false, brokenReasons: '' };
}
