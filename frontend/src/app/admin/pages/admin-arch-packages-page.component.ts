import { Component, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FormField, form, required, submit } from '@angular/forms/signals';
import { ArchPackage } from '@chaotic-next/shared-lib';
import { ConfirmationService } from '@openng/optimus-ui/api';
import { Button } from '@openng/optimus-ui/button';
import { Dialog } from '@openng/optimus-ui/dialog';
import { IconField } from '@openng/optimus-ui/iconfield';
import { InputIcon } from '@openng/optimus-ui/inputicon';
import { InputText } from '@openng/optimus-ui/inputtext';
import { TableModule } from '@openng/optimus-ui/table';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { AdminService, ArchPackageFormData } from '../admin.service';

interface ArchPackageFormModel {
  pkgname: string;
  version: string;
  pkgrel: string;
  arch: string;
}

@Component({
  selector: 'chaotic-admin-arch-packages-page',
  imports: [Button, Dialog, FormField, FormsModule, IconField, InputIcon, InputText, TableModule, Tooltip],
  template: `
    <div class="table-container">
      <p-table
        [value]="service.archPackages()?.items ?? []"
        [rows]="25"
        [loading]="service.archPackagesLoading()"
        [paginator]="true"
        [lazy]="true"
        [totalRecords]="service.archPackagesTotal()"
        [showCurrentPageReport]="true"
        [rowsPerPageOptions]="[25, 50, 100]"
        (onLazyLoad)="onLazyLoad($event)"
        dataKey="id"
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
            <th class="cell-actions" style="min-width: 8rem">Actions</th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-pkg>
          <tr>
            <td>{{ pkg.id }}</td>
            <td>{{ pkg.pkgname }}</td>
            <td>{{ pkg.version }}{{ pkg.pkgrel ? '-' + pkg.pkgrel : '' }}</td>
            <td>{{ pkg.arch }}</td>
            <td class="cell-actions">
              <div class="flex gap-2">
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
        <div class="flex justify-end gap-2">
          <p-button (onClick)="dialogVisible.set(false)" type="button" severity="secondary" text label="Cancel" />
          <p-button [disabled]="packageForm().invalid()" type="submit" severity="primary" label="Save" />
        </div>
      </form>
    </p-dialog>
  `,
})
export class AdminArchPackagesPageComponent {
  readonly service = inject(AdminService);
  private readonly confirmationService = inject(ConfirmationService);

  readonly q = input<string>();

  readonly dialogVisible = signal(false);
  readonly editing = signal<ArchPackage | null>(null);

  private readonly model = signal<ArchPackageFormModel>(emptyModel());
  readonly packageForm = form(this.model, (s) => {
    required(s.pkgname, { message: 'Package name is required' });
  });

  constructor() {
    effect(() => {
      const q = this.q();
      if (typeof q === 'string' && q.trim()) {
        this.service.archQuery.set(q);
        this.service.archPage.set(1);
      }
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

  onLazyLoad(event: { first?: number; rows?: number | null }): void {
    this.service.archPage.set(Math.floor((event.first ?? 0) / (event.rows ?? 25)) + 1);
  }

  onSearch(event: Event): void {
    this.service.archQuery.set((event.target as HTMLInputElement).value);
    this.service.archPage.set(1);
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
