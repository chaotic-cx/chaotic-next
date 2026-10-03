import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FormField, form, required, submit } from '@angular/forms/signals';
import { ArchPackage, PKG_TYPE_ARCH } from '@chaotic-next/shared-lib';
import { ConfirmationService } from '@openng/optimus-ui/api';
import { Button } from '@openng/optimus-ui/button';
import { Dialog } from '@openng/optimus-ui/dialog';
import { IconField } from '@openng/optimus-ui/iconfield';
import { InputIcon } from '@openng/optimus-ui/inputicon';
import { InputText } from '@openng/optimus-ui/inputtext';
import { TableModule } from '@openng/optimus-ui/table';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { ActivatedRoute, Router } from '@angular/router';
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
  ],
  template: `
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
            <th style="min-width: 6rem">Arch</th>
            <th class="cell-actions"><span class="sr-only">Actions</span></th>
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
                  [attr.aria-label]="'Rescan ELF signals ' + pkg.pkgname"
                  (click)="rescanPackage(pkg)"
                  type="button"
                  pTooltip="Rescan ELF signals"
                  tooltipPosition="left"
                >
                  <i class="pi pi-refresh" aria-hidden="true"></i>
                </button>
                <button
                  class="chaotic-icon-btn"
                  [attr.aria-label]="'Edit ' + pkg.pkgname"
                  (click)="openEdit(pkg)"
                  type="button"
                  pTooltip="Edit"
                  tooltipPosition="left"
                >
                  <i class="pi pi-pencil" aria-hidden="true"></i>
                </button>
                <button
                  class="chaotic-icon-btn chaotic-icon-btn--danger"
                  [attr.aria-label]="'Delete ' + pkg.pkgname"
                  (click)="confirmDelete(pkg)"
                  type="button"
                  pTooltip="Delete"
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
              <td [attr.colspan]="5"><p class="chaotic-card__empty">No Arch packages match this search.</p></td>
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
      [header]="'Edit Arch package'"
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
        </div>
        <label class="flex flex-col gap-1">
          <span class="text-ctp-text text-sm">Arch</span>
          <input [formField]="packageForm.arch" pInputText type="text" />
        </label>
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
  `,
})
export class AdminArchPackagesPageComponent {
  readonly service = inject(AdminService);
  private readonly confirmationService = inject(ConfirmationService);
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
    required(s.pkgname, { message: 'Package name is required' });
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
      message: `Delete Arch package "${pkg.pkgname}"? This cannot be undone.`,
      header: 'Delete Arch package',
      acceptLabel: 'Delete',
      rejectLabel: 'Cancel',
      accept: () => void this.service.deleteArchPackage(pkg.id),
    });
  }

  rescanPackage(pkg: ArchPackage): void {
    this.confirmationService.confirm({
      message: `Rescan ELF signals for <code>${pkg.pkgname}</code>? This will download and scan the package archive.`,
      header: 'Rescan ELF signals',
      acceptLabel: 'Rescan',
      rejectLabel: 'Cancel',
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
