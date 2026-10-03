import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FormField, form, required, submit } from '@angular/forms/signals';
import { ActivatedRoute, Router } from '@angular/router';
import { ArchPackage, PKG_TYPE_ARCH } from '@chaotic-next/shared-lib';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { ConfirmationService } from '@openng/optimus-ui/api';
import { Button } from '@openng/optimus-ui/button';
import { Dialog } from '@openng/optimus-ui/dialog';
import { IconField } from '@openng/optimus-ui/iconfield';
import { InputIcon } from '@openng/optimus-ui/inputicon';
import { InputText } from '@openng/optimus-ui/inputtext';
import { TableModule } from '@openng/optimus-ui/table';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { ClearFiltersComponent } from '../../empty-state/clear-filters.component';
import { EmptyStateComponent } from '../../empty-state/empty-state.component';
import { LoadErrorComponent } from '../../load-error/load-error.component';
import { MISSING_VALUE } from '../../table-columns/missing-value';
import { TablePageReportDirective } from '../../table-page-report.directive';
import { AdminService, ArchPackageFormData } from '../admin.service';
import {
  createAdminPagination,
  type StatefulTableRef,
  createDebounced,
  QUERY_SYNC_DEBOUNCE_MS,
  patchQueryParams,
  queryFromRaw,
  queryToQuery,
  restoreQueryParams,
} from '../admin-url-sync';
import { EditConflictGuard } from '../edit-conflict';
import { EditConflictNoticeComponent } from '../edit-conflict-notice.component';
import { TABLE_ROW_HEIGHTS } from '../../table-skeleton/table-row-heights';
import { TableSkeletonRowsComponent } from '../../table-skeleton/table-skeleton-rows.component';

interface ArchPackageFormModel {
  pkgname: string;
  version: string;
  pkgrel: string;
  arch: string;
}

function archPackageConflictFields(pkg: ArchPackage): Record<string, unknown> {
  return { pkgname: pkg.pkgname, version: pkg.version, pkgrel: pkg.pkgrel, arch: pkg.arch };
}

@Component({
  selector: 'chaotic-admin-arch-packages-page',
  imports: [
    TableSkeletonRowsComponent,
    EditConflictNoticeComponent,
    Button,
    ClearFiltersComponent,
    Dialog,
    EmptyStateComponent,
    FormField,
    FormsModule,
    IconField,
    InputIcon,
    InputText,
    LoadErrorComponent,
    TableModule,
    TablePageReportDirective,
    Tooltip,
    TranslocoDirective,
  ],
  template: `
    <ng-container *transloco="let t">
      <div class="table-container">
        <p-table
          #archPackagesTable
          [value]="service.archPackages()?.items ?? []"
          [rows]="pagination.perPage()"
          [paginator]="true"
          [lazy]="true"
          [totalRecords]="service.archPackagesTotal()"
          [chaoticTableFailed]="service.archPackagesStatus.failed()"
          [rowsPerPageOptions]="[25, 50, 100]"
          (onLazyLoad)="onLazyLoad(archPackagesTable, $event)"
          dataKey="id"
          stateStorage="local"
          stateKey="admin-arch-packages-table"
          paginatorDropdownAppendTo="body"
          chaoticPageReport
        >
          <ng-template #caption>
            <div class="flex flex-wrap items-center justify-end gap-2.5">
              <chaotic-clear-filters [active]="filtersActive()" (clear)="clearFilters()" />
              <p-iconfield class="w-full sm:w-64" iconPosition="left">
                <p-inputicon>
                  <i class="pi pi-search" aria-hidden="true"></i>
                </p-inputicon>
                <input
                  class="w-full"
                  [value]="service.archQuery()"
                  [placeholder]="t('admin.pages.searchPkgname')"
                  [attr.aria-label]="t('admin.pages.searchPkgname')"
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
              <th style="min-width: 10rem">{{ t('admin.pages.columns.version') }}</th>
              <th style="min-width: 6rem">{{ t('admin.pages.columns.arch') }}</th>
              <th class="cell-actions">
                <span class="sr-only">{{ t('admin.pages.columns.actions') }}</span>
              </th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-pkg>
            <tr>
              <td>{{ pkg.id }}</td>
              <td>
                <span class="block max-w-xs truncate" [title]="pkg.pkgname">{{ pkg.pkgname }}</span>
              </td>
              <td>
                @if (pkg.version) {
                  {{ pkg.version }}{{ pkg.pkgrel ? '-' + pkg.pkgrel : '' }}
                } @else {
                  <span class="text-ctp-subtext0">{{ missingValue }}</span>
                }
              </td>
              <td>{{ pkg.arch ?? missingValue }}</td>
              <td class="cell-actions">
                <div class="flex items-center justify-end gap-1">
                  <button
                    class="chaotic-icon-btn"
                    [attr.aria-label]="t('admin.pages.rescanElf.ariaLabel', { name: pkg.pkgname })"
                    [pTooltip]="t('admin.pages.rescanElf.label')"
                    (click)="rescanPackage(pkg)"
                    type="button"
                    tooltipPosition="left"
                  >
                    <i class="pi pi-refresh" aria-hidden="true"></i>
                  </button>
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
                    class="chaotic-icon-btn chaotic-icon-btn--danger"
                    [attr.aria-label]="t('admin.pages.deleteAriaLabel', { name: pkg.pkgname })"
                    [pTooltip]="t('common.delete')"
                    (click)="confirmDelete(pkg)"
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
            @if (service.archPackagesLoading()) {
              <chaotic-table-skeleton-rows
                [rowHeight]="rowHeights.adminArchPackages"
                [rows]="pagination.perPage()"
                [columns]="5"
              />
            } @else {
              <tr>
                <td [attr.colspan]="5">
                  @if (service.archPackagesStatus.failed()) {
                    <chaotic-load-error
                      [message]="t('admin.archPackages.loadError')"
                      [error]="service.archPackagesStatus.error()"
                      (retry)="service.archPackagesStatus.reload()"
                    />
                  } @else if (filtersActive()) {
                    <chaotic-empty-state [filtered]="true" (clearFilters)="clearFilters()">
                      <p>{{ t('admin.archPackages.empty') }}</p>
                    </chaotic-empty-state>
                  } @else {
                    <chaotic-empty-state [hint]="t('admin.archPackages.firstRun.hint')">
                      <p>{{ t('admin.archPackages.firstRun.message') }}</p>
                    </chaotic-empty-state>
                  }
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
        [header]="t('admin.archPackages.editDialog.header')"
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
          </div>
          <label class="flex flex-col gap-1">
            <span class="text-ctp-text text-sm">{{ t('admin.pages.columns.arch') }}</span>
            <input [formField]="packageForm.arch" pInputText type="text" />
          </label>
          @if (conflict.changed()) {
            <chaotic-edit-conflict-notice
              [messageKey]="conflictMessageKey"
              (review)="reviewConflict()"
              (saveAnyway)="saveAnyway()"
            />
          }
          <div class="flex flex-wrap justify-end gap-2">
            <p-button
              [label]="t('common.cancel')"
              (onClick)="dialogVisible.set(false)"
              type="button"
              severity="secondary"
              text
              size="small"
            />
            <p-button
              [disabled]="packageForm().invalid()"
              [label]="t('common.save')"
              type="submit"
              severity="primary"
              size="small"
            />
          </div>
        </form>
      </p-dialog>
    </ng-container>
  `,
})
export class AdminArchPackagesPageComponent {
  readonly service = inject(AdminService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly transloco = inject(TranslocoService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly rowHeights = TABLE_ROW_HEIGHTS;
  protected readonly missingValue = MISSING_VALUE;

  protected readonly filtersActive = computed(() => this.service.archQuery() !== '');

  readonly pagination = createAdminPagination({ router: this.router, route: this.route });

  readonly dialogVisible = signal(false);
  readonly editing = signal<ArchPackage | null>(null);
  protected readonly conflict = new EditConflictGuard<ArchPackage>(archPackageConflictFields);
  protected readonly conflictMessageKey = marker('admin.editConflict.messages.archPackage');

  private readonly syncSearch = createDebounced(QUERY_SYNC_DEBOUNCE_MS, () =>
    patchQueryParams(this.router, this.route, { q: queryToQuery(this.service.archQuery()) }),
  );

  private readonly model = signal<ArchPackageFormModel>(emptyModel());
  readonly packageForm = form(this.model, (s) => {
    required(s.pkgname);
  });

  constructor() {
    this.service.useLists(['archPackages']);
    this.pagination.restoreFromQuery(this.route);
    this.service.archPage.set(this.pagination.page());
    this.service.archPerPage.set(this.pagination.perPage());
    restoreQueryParams(this.route, {
      q: (raw) => this.service.archQuery.set(queryFromRaw(raw)),
    });
  }

  openEdit(pkg: ArchPackage): void {
    this.conflict.begin(pkg);
    this.editing.set(pkg);
    this.fillForm(pkg);
    this.dialogVisible.set(true);
  }

  private fillForm(pkg: ArchPackage): void {
    this.model.set({
      pkgname: pkg.pkgname,
      version: pkg.version ?? '',
      pkgrel: pkg.pkgrel === undefined ? '' : String(pkg.pkgrel),
      arch: pkg.arch ?? '',
    });
  }

  protected reviewConflict(): void {
    const latest = this.conflict.review();
    if (latest === null) {
      return;
    }

    this.editing.set(latest);
    this.fillForm(latest);
  }

  protected saveAnyway(): void {
    this.conflict.overwrite();
    this.save();
  }

  save(): void {
    submit(this.packageForm, async () => {
      const current = this.editing();
      if (!current) {
        this.dialogVisible.set(false);
        return;
      }

      const unchanged = await this.conflict.confirmUnchanged(() => this.service.findArchPackage(current));
      if (!unchanged) {
        return;
      }

      const saved = await this.service.updateArchPackage(current.id, this.toFormData(this.model()));
      if (saved) {
        this.dialogVisible.set(false);
      }
    });
  }

  confirmDelete(pkg: ArchPackage): void {
    this.confirmationService.confirm({
      message: this.transloco.translate('admin.archPackages.deleteConfirm.message', { pkgname: pkg.pkgname }),
      header: this.transloco.translate('admin.archPackages.deleteConfirm.header'),
      acceptLabel: this.transloco.translate('common.delete'),
      rejectLabel: this.transloco.translate('common.cancel'),
      accept: () => void this.service.deleteArchPackage(pkg.id),
    });
  }

  rescanPackage(pkg: ArchPackage): void {
    this.confirmationService.confirm({
      message: this.transloco.translate('admin.pages.rescanElf.confirmMessage', { pkgname: pkg.pkgname }),
      header: this.transloco.translate('admin.pages.rescanElf.label'),
      acceptLabel: this.transloco.translate('admin.pages.rescanElf.accept'),
      rejectLabel: this.transloco.translate('common.cancel'),
      accept: () => void this.service.rescanPackage(pkg.pkgname, PKG_TYPE_ARCH),
    });
  }

  onLazyLoad(table: StatefulTableRef, event: { first?: number; rows?: number | null }): void {
    this.pagination.handleStatefulLazyLoad(table, event);
    this.service.archPage.set(this.pagination.page());
    this.service.archPerPage.set(this.pagination.perPage());
  }

  clearFilters(): void {
    this.service.archQuery.set('');
    this.resetToFirstPage();
    patchQueryParams(this.router, this.route, { q: null });
  }

  onSearch(event: Event): void {
    this.service.archQuery.set((event.target as HTMLInputElement).value);
    this.resetToFirstPage();
    this.syncSearch();
  }

  private resetToFirstPage(): void {
    this.pagination.resetPage();
    this.service.archPage.set(this.pagination.page());
  }

  private toFormData(model: ArchPackageFormModel): ArchPackageFormData {
    return {
      pkgname: model.pkgname,
      version: model.version === '' ? undefined : model.version,
      pkgrel: model.pkgrel === '' ? undefined : Number(model.pkgrel),
      arch: model.arch === '' ? undefined : model.arch,
    };
  }
}

function emptyModel(): ArchPackageFormModel {
  return { pkgname: '', version: '', pkgrel: '', arch: '' };
}
