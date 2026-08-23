import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FormField, form, pattern, required, submit } from '@angular/forms/signals';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { AdminPackageElfAnalysis } from '@chaotic-next/shared-lib';
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
import { TagModule } from '@openng/optimus-ui/tag';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { PackageTriggerSourcesComponent } from '../../package-trigger-sources/package-trigger-sources.component';
import { AdminService, ElfAnalysisFormData } from '../admin.service';
import {
  createAdminPagination,
  createDebounced,
  patchQueryParams,
  queryFromRaw,
  queryToQuery,
  restoreQueryParams,
} from '../admin-url-sync';

interface ElfAnalysisFormModel {
  pkgType: '0' | '1';
  pkgId: string;
  version: string;
  broken: boolean;
  brokenReasons: string;
}

const PKG_TYPE_OPTIONS = [
  { label: 'Arch (0)', value: '0' },
  { label: 'Chaotic (1)', value: '1' },
];

@Component({
  selector: 'chaotic-admin-package-elf-analysis-page',
  imports: [
    Button,
    Checkbox,
    DatePipe,
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
    TagModule,
    Tooltip,
  ],
  template: `
    <div class="table-container">
      <p-table
        [value]="service.elfAnalysis()?.items ?? []"
        [rows]="pagination.perPage()"
        [loading]="service.elfAnalysisLoading()"
        [paginator]="true"
        [lazy]="true"
        [totalRecords]="service.elfAnalysisTotal()"
        [showCurrentPageReport]="true"
        [rowsPerPageOptions]="[25, 50, 100]"
        (onLazyLoad)="onLazyLoad($event)"
        dataKey="id"
        paginatorDropdownAppendTo="body"
      >
        <ng-template #caption>
          <div class="flex flex-col gap-2.5 sm:flex-row sm:flex-nowrap sm:items-center">
            <div class="hidden sm:ml-auto sm:flex sm:flex-wrap sm:items-center sm:gap-2.5">
              <p-select
                [options]="pkgTypeOptions"
                [ngModel]="service.elfAnalysisPkgTypeFilter()"
                (ngModelChange)="setPkgTypeFilter($event)"
                optionLabel="label"
                optionValue="value"
                placeholder="Package type"
                showClear
                appendTo="body"
              />
              <p-select
                [options]="brokenOptions"
                [ngModel]="service.elfAnalysisBrokenFilter()"
                (ngModelChange)="setBrokenFilter($event)"
                optionLabel="label"
                optionValue="value"
                placeholder="Broken"
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
                (input)="onSearch($event)"
                pInputText
                type="text"
                placeholder="Search version or pkg id"
              />
            </p-iconfield>
          </div>
        </ng-template>
        <ng-template #header>
          <tr>
            <th style="min-width: 3rem">ID</th>
            <th style="min-width: 6rem">Type</th>
            <th style="min-width: 12rem">Package</th>
            <th style="min-width: 10rem">Version</th>
            <th style="min-width: 7rem">Has ELF</th>
            <th style="min-width: 7rem">Source compiled</th>
            <th style="min-width: 6rem">Broken</th>
            <th style="min-width: 12rem">Broken reasons</th>
            <th style="min-width: 9rem">Scanned</th>
            <th class="cell-actions" style="min-width: 8rem">Actions</th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-row>
          <tr>
            <td>{{ row.id }}</td>
            <td>{{ row.pkgType }}</td>
            <td>
              @if (row.pkgname) {
                <a
                  class="cursor-pointer text-ctp-mauve hover:underline"
                  [routerLink]="packageLink(row)"
                  [queryParams]="{ q: row.pkgname }"
                >
                  {{ row.pkgname }}
                </a>
                <span class="text-ctp-subtext text-xs">#{{ row.pkgId }}</span>
              } @else {
                <span class="text-ctp-subtext">#{{ row.pkgId }}</span>
              }
            </td>
            <td>{{ row.version }}</td>
            <td>
              @if (row.hasCompiledCode) {
                <p-tag value="Yes" severity="success" />
              } @else {
                <p-tag value="No" severity="secondary" />
              }
            </td>
            <td>
              @if (row.isSourceCompiled) {
                <p-tag value="Yes" severity="success" />
              } @else {
                <p-tag value="No" severity="secondary" />
              }
            </td>
            <td>
              @if (row.broken) {
                <p-tag value="Broken" severity="danger" />
              } @else {
                <p-tag value="OK" severity="success" />
              }
            </td>
            <td class="text-ctp-subtext">{{ row.brokenReasons?.join(', ') }}</td>
            <td>{{ row.scannedAt | date: 'short' }}</td>
            <td class="cell-actions">
              <div class="flex gap-2">
                <p-button
                  (onClick)="openEdit(row)"
                  icon="pi pi-pencil"
                  severity="secondary"
                  text
                  rounded
                  pTooltip="Edit"
                  tooltipPosition="left"
                />
                <p-button
                  (onClick)="confirmDelete(row)"
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
      [header]="'Edit ELF analysis'"
    >
      <form class="flex flex-col gap-4" (submit)="save(); $event.preventDefault()">
        <div class="flex flex-wrap gap-4">
          <div class="flex flex-1 flex-col gap-1">
            <span class="text-ctp-text text-sm">Package type</span>
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
            <span class="text-ctp-text text-sm">Package ID</span>
            <input [formField]="elfForm.pkgId" pInputText type="text" inputmode="numeric" />
          </label>
        </div>
        <label class="flex flex-col gap-1">
          <span class="text-ctp-text text-sm">Version</span>
          <input [formField]="elfForm.version" pInputText type="text" />
          @if (elfForm.version().touched() && elfForm.version().errors().length) {
            <span class="text-ctp-red text-xs">{{ elfForm.version().errors()[0].message }}</span>
          }
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-ctp-text text-sm">Broken reasons</span>
          <input [formField]="elfForm.brokenReasons" pInputText type="text" />
          <span class="text-ctp-subtext text-xs">Comma-separated reasons; leave empty when not broken.</span>
        </label>
        <div class="flex items-center gap-2">
          <p-checkbox [formField]="elfForm.broken" [binary]="true" inputId="elfBroken" />
          <label class="text-ctp-text text-sm" for="elfBroken">Broken</label>
        </div>
        <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div class="flex flex-col gap-2">
            <span class="text-ctp-text text-sm">Rebuild triggers</span>
            @if (service.elfAnalysisBumpsLoading()) {
              <p-progress-spinner
                [style]="{ width: '24px', height: '24px' }"
                ariaLabel="Loading rebuild triggers"
                strokeWidth="4"
              />
            } @else if (!service.elfAnalysisBumps() || service.elfAnalysisBumps()?.length === 0) {
              <span class="text-ctp-subtext text-xs">No rebuild triggers found.</span>
            } @else {
              <ul class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                @for (bump of service.elfAnalysisBumps()!; track bump.id) {
                  <li class="flex flex-col rounded border border-ctp-surface1 bg-ctp-base px-3 py-2">
                    <span class="text-ctp-text text-sm">
                      {{ bump.pkgname || '#' + bump.trigger }}
                      @if (bump.triggerName) {
                        <span class="text-ctp-subtext">(triggered by {{ bump.triggerName }})</span>
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
            <span class="text-ctp-text text-sm">Rebuild trigger sources</span>
            <chaotic-package-trigger-sources [pkgname]="editing()?.pkgname" />
          </div>
        </div>
        <div class="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <p-button
            (onClick)="closeDialog()"
            type="button"
            severity="secondary"
            text
            label="Cancel"
            styleClass="w-full sm:w-auto"
          />
          <p-button
            [disabled]="elfForm().invalid()"
            type="submit"
            severity="primary"
            label="Save"
            styleClass="w-full sm:w-auto"
          />
        </div>
      </form>
    </p-dialog>
  `,
})
export class AdminPackageElfAnalysisPageComponent {
  readonly service = inject(AdminService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly pagination = createAdminPagination({ router: this.router, route: this.route });

  readonly dialogVisible = signal(false);
  readonly editing = signal<AdminPackageElfAnalysis | null>(null);

  readonly pkgTypeOptions = PKG_TYPE_OPTIONS;
  readonly brokenOptions = [
    { label: 'Broken', value: true },
    { label: 'OK', value: false },
  ];

  private readonly syncSearch = createDebounced(400, () =>
    patchQueryParams(this.router, this.route, { q: queryToQuery(this.service.elfAnalysisQuery()) }),
  );

  constructor() {
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
    required(s.version, { message: 'Version is required' });
    required(s.pkgId, { message: 'Package ID is required' });
    pattern(s.pkgId, /^\d+$/, { message: 'Package ID must be a number' });
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
      message: `Delete ELF analysis row #${row.id} for ${row.version}? This cannot be undone.`,
      header: 'Delete ELF analysis',
      acceptLabel: 'Delete',
      rejectLabel: 'Cancel',
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

  onLazyLoad(event: { first?: number; rows?: number | null }): void {
    this.pagination.handleLazyLoad(event);
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
