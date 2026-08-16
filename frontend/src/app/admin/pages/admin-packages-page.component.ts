import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FormField, form, required, submit } from '@angular/forms/signals';
import { Package as PackageDto } from '@chaotic-next/shared-lib';
import { ConfirmationService } from '@openng/optimus-ui/api';
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
import { Router } from '@angular/router';
import { AdminService, PackageFormData } from '../admin.service';

interface PackageFormModel {
  pkgname: string;
  isActive: boolean;
  skipSignalScan: boolean;
  version: string;
  pkgrel: string;
  repoId: string;
}

const NO_REPO = '0';

@Component({
  selector: 'chaotic-admin-packages-page',
  imports: [
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
        [value]="service.packages()?.items ?? []"
        [rows]="25"
        [loading]="service.packagesLoading()"
        [paginator]="true"
        [lazy]="true"
        [totalRecords]="service.packagesTotal()"
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
                [options]="service.repos() ?? []"
                [ngModel]="service.packageRepoFilter()"
                (ngModelChange)="service.setPackageRepoFilter($event)"
                optionLabel="name"
                optionValue="id"
                placeholder="All repos"
                showClear
                appendTo="body"
              />
              <p-select
                [options]="service.activeOptions"
                [ngModel]="service.packageActiveFilter()"
                (ngModelChange)="service.setPackageActiveFilter($event)"
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
                [value]="service.packageQuery()"
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
            <th style="min-width: 6rem">Active</th>
            <th class="cell-actions" style="min-width: 8rem">Actions</th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-pkg>
          <tr>
            <td>{{ pkg.id }}</td>
            <td>{{ pkg.pkgname }}</td>
            <td>{{ pkg.version }}{{ pkg.pkgrel ? '-' + pkg.pkgrel : '' }}</td>
            <td>
              @if (pkg.reponame) {
                <button class="cursor-pointer text-ctp-mauve hover:underline" (click)="goToRepos()" type="button">
                  {{ pkg.reponame }}
                </button>
              }
            </td>
            <td>
              @if (pkg.isActive) {
                <p-tag value="Active" severity="success" />
              } @else {
                <p-tag value="Inactive" severity="secondary" />
              }
            </td>
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
        </div>
        <div class="flex justify-end gap-2">
          <p-button (onClick)="dialogVisible.set(false)" type="button" severity="secondary" text label="Cancel" />
          <p-button [disabled]="packageForm().invalid()" type="submit" severity="primary" label="Save" />
        </div>
      </form>
    </p-dialog>
  `,
})
export class AdminPackagesPageComponent {
  readonly service = inject(AdminService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly router = inject(Router);

  readonly q = input<string>();

  readonly dialogVisible = signal(false);
  readonly editing = signal<PackageDto | null>(null);

  protected readonly model = signal<PackageFormModel>(emptyModel());
  readonly packageForm = form(this.model, (s) => {
    required(s.pkgname, { message: 'Package name is required' });
  });

  readonly repoOptions = computed(() => [
    { label: 'None', value: NO_REPO },
    ...(this.service.repos() ?? []).map((repo) => ({ label: repo.name, value: String(repo.id) })),
  ]);

  constructor() {
    effect(() => {
      const q = this.q();
      if (typeof q === 'string' && q.trim()) {
        this.service.packageQuery.set(q);
        this.service.packagePage.set(1);
      }
    });
  }

  openEdit(pkg: PackageDto): void {
    this.editing.set(pkg);
    this.model.set({
      pkgname: pkg.pkgname,
      isActive: pkg.isActive,
      skipSignalScan: pkg.skipSignalScan ?? false,
      version: pkg.version ?? '',
      pkgrel: pkg.pkgrel === undefined ? '' : String(pkg.pkgrel),
      repoId: pkg.repo === undefined ? NO_REPO : String(pkg.repo),
    });
    this.dialogVisible.set(true);
  }

  save(): void {
    submit(this.packageForm, async () => {
      const data = this.toFormData(this.model());
      const current = this.editing();
      if (current) await this.service.updatePackage(current.id, data);
      this.dialogVisible.set(false);
    });
  }

  confirmDelete(pkg: PackageDto): void {
    this.confirmationService.confirm({
      message: `Delete package "${pkg.pkgname}"? This cannot be undone.`,
      header: 'Delete package',
      acceptLabel: 'Delete',
      rejectLabel: 'Cancel',
      accept: () => void this.service.deletePackage(pkg.id),
    });
  }

  onLazyLoad(event: { first?: number; rows?: number | null }): void {
    this.service.packagePage.set(Math.floor((event.first ?? 0) / (event.rows ?? 25)) + 1);
  }

  onSearch(event: Event): void {
    this.service.packageQuery.set((event.target as HTMLInputElement).value);
    this.service.packagePage.set(1);
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
      version: model.version === '' ? undefined : model.version,
      pkgrel: model.pkgrel === '' ? undefined : Number(model.pkgrel),
      repoId: model.repoId === NO_REPO ? undefined : Number(model.repoId),
    };
  }
}

function emptyModel(): PackageFormModel {
  return { pkgname: '', isActive: true, skipSignalScan: false, version: '', pkgrel: '', repoId: NO_REPO };
}
