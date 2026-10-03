import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FormField, form, required, submit } from '@angular/forms/signals';
import { ActivatedRoute, Router } from '@angular/router';
import { ArchPackage, PKG_TYPE_ARCH } from '@chaotic-next/shared-lib';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { ConfirmationService } from '@openng/optimus-ui/api';
import { Button } from '@openng/optimus-ui/button';
import { Dialog } from '@openng/optimus-ui/dialog';
import { IconField } from '@openng/optimus-ui/iconfield';
import { InputIcon } from '@openng/optimus-ui/inputicon';
import { InputText } from '@openng/optimus-ui/inputtext';
import { TableModule } from '@openng/optimus-ui/table';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { AdminService, ArchPackageFormData } from '../admin.service';
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

interface ArchPackageFormModel {
  pkgname: string;
  version: string;
  pkgrel: string;
  arch: string;
}

@Component({
  selector: 'chaotic-admin-arch-packages-page',
  imports: [
    TableSkeletonRowsComponent,
    Button,
    Dialog,
    FormField,
    FormsModule,
    IconField,
    InputIcon,
    InputText,
    TableModule,
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
          [showCurrentPageReport]="true"
          [rowsPerPageOptions]="[25, 50, 100]"
          (onLazyLoad)="onLazyLoad(archPackagesTable, $event)"
          dataKey="id"
          stateStorage="local"
          stateKey="admin-arch-packages-table"
          paginatorDropdownAppendTo="body"
        >
          <ng-template #caption>
            <div class="flex">
              <p-iconfield class="ml-auto w-full sm:w-64" iconPosition="left">
                <p-inputicon>
                  <i class="pi pi-search"></i>
                </p-inputicon>
                <input
                  class="w-full"
                  [value]="service.archQuery()"
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
              <td>{{ pkg.pkgname }}</td>
              <td>{{ pkg.version }}{{ pkg.pkgrel ? '-' + pkg.pkgrel : '' }}</td>
              <td>{{ pkg.arch }}</td>
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
                  <p class="chaotic-card__empty">{{ t('admin.archPackages.empty') }}</p>
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

  readonly pagination = createAdminPagination({ router: this.router, route: this.route });

  readonly dialogVisible = signal(false);
  readonly editing = signal<ArchPackage | null>(null);

  private readonly syncSearch = createDebounced(400, () =>
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
    this.editing.set(pkg);
    this.model.set({
      pkgname: pkg.pkgname,
      version: pkg.version ?? '',
      pkgrel: pkg.pkgrel === undefined ? '' : String(pkg.pkgrel),
      arch: pkg.arch ?? '',
    });
    this.dialogVisible.set(true);
  }

  save(): void {
    submit(this.packageForm, async () => {
      const data = this.toFormData(this.model());
      const current = this.editing();
      if (current) await this.service.updateArchPackage(current.id, data);
      this.dialogVisible.set(false);
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
    this.service.archPerPage.set(event.rows ?? 25);
  }

  onSearch(event: Event): void {
    this.service.archQuery.set((event.target as HTMLInputElement).value);
    this.pagination.resetPage();
    this.syncSearch();
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
