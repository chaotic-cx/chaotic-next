import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { form, FormField, required, submit } from '@angular/forms/signals';
import { Builder } from '@chaotic-next/shared-lib';
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
import { AdminService, BuilderFormData } from '../admin.service';

interface BuilderFormModel {
  name: string;
  description: string;
  builderClass: string;
  isActive: boolean;
}

@Component({
  selector: 'chaotic-admin-builders-page',
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
        [value]="service.builders()?.items ?? []"
        [rows]="25"
        [loading]="service.buildersLoading()"
        [paginator]="true"
        [lazy]="true"
        [totalRecords]="service.buildersTotal()"
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
                [options]="service.activeOptions"
                [ngModel]="service.builderActiveFilter()"
                (ngModelChange)="setActiveFilter($event)"
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
                [value]="service.builderQuery()"
                (input)="onSearch($event)"
                pInputText
                type="text"
                placeholder="Search name"
              />
            </p-iconfield>
          </div>
        </ng-template>
        <ng-template #header>
          <tr>
            <th style="min-width: 3rem">ID</th>
            <th style="min-width: 10rem">Name</th>
            <th style="min-width: 14rem">Description</th>
            <th style="min-width: 10rem">Class</th>
            <th style="min-width: 6rem">Active</th>
            <th class="cell-actions" style="min-width: 8rem">Actions</th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-builder>
          <tr>
            <td>{{ builder.id }}</td>
            <td>{{ builder.name }}</td>
            <td class="text-ctp-subtext">{{ builder.description }}</td>
            <td>{{ builder.builderClass }}</td>
            <td>
              @if (builder.isActive) {
                <p-tag value="Active" severity="success" />
              } @else {
                <p-tag value="Inactive" severity="secondary" />
              }
            </td>
            <td class="cell-actions">
              <div class="flex gap-2">
                <p-button
                  (onClick)="openEdit(builder)"
                  icon="pi pi-pencil"
                  severity="secondary"
                  text
                  rounded
                  pTooltip="Edit"
                  tooltipPosition="left"
                />
                <p-button
                  (onClick)="confirmDelete(builder)"
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
      [header]="'Edit builder'"
    >
      <form class="flex flex-col gap-4" (submit)="save(); $event.preventDefault()">
        <label class="flex flex-col gap-1">
          <span class="text-ctp-text text-sm">Name</span>
          <input [formField]="builderForm.name" pInputText type="text" />
          @if (builderForm.name().touched() && builderForm.name().errors().length) {
            <span class="text-ctp-red text-xs">{{ builderForm.name().errors()[0].message }}</span>
          }
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-ctp-text text-sm">Description</span>
          <input [formField]="builderForm.description" pInputText type="text" />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-ctp-text text-sm">Class</span>
          <input [formField]="builderForm.builderClass" pInputText type="text" />
        </label>
        <div class="flex items-center gap-2">
          <p-checkbox [formField]="builderForm.isActive" [binary]="true" inputId="builderIsActive" />
          <label class="text-ctp-text text-sm" for="builderIsActive">Active</label>
        </div>
        <div class="flex justify-end gap-2">
          <p-button (onClick)="dialogVisible.set(false)" type="button" severity="secondary" text label="Cancel" />
          <p-button [disabled]="builderForm().invalid()" type="submit" severity="primary" label="Save" />
        </div>
      </form>
    </p-dialog>
  `,
})
export class AdminBuildersPageComponent {
  readonly service = inject(AdminService);
  private readonly confirmationService = inject(ConfirmationService);

  readonly dialogVisible = signal(false);
  readonly editing = signal<Builder | null>(null);

  private readonly model = signal<BuilderFormModel>(emptyModel());
  readonly builderForm = form(this.model, (s) => {
    required(s.name, { message: 'Builder name is required' });
  });

  openEdit(builder: Builder): void {
    this.editing.set(builder);
    this.model.set({
      name: builder.name,
      description: builder.description ?? '',
      builderClass: builder.builderClass ?? '',
      isActive: builder.isActive ?? true,
    });
    this.dialogVisible.set(true);
  }

  save(): void {
    submit(this.builderForm, async () => {
      const data = this.toFormData(this.model());
      const current = this.editing();
      if (current) await this.service.updateBuilder(current.id, data);
      this.dialogVisible.set(false);
    });
  }

  confirmDelete(builder: Builder): void {
    this.confirmationService.confirm({
      message: `Delete builder "${builder.name}"? This cannot be undone.`,
      header: 'Delete builder',
      acceptLabel: 'Delete',
      rejectLabel: 'Cancel',
      accept: () => void this.service.deleteBuilder(builder.id),
    });
  }

  onLazyLoad(event: { first?: number; rows?: number | null }): void {
    this.service.builderPage.set(Math.floor((event.first ?? 0) / (event.rows ?? 25)) + 1);
  }

  onSearch(event: Event): void {
    this.service.builderQuery.set((event.target as HTMLInputElement).value);
    this.service.builderPage.set(1);
  }

  setActiveFilter(value: 'active' | 'inactive' | null | undefined): void {
    this.service.builderActiveFilter.set(value ?? undefined);
    this.service.builderPage.set(1);
  }

  private toFormData(model: BuilderFormModel): BuilderFormData {
    return {
      name: model.name,
      description: model.description === '' ? undefined : model.description,
      builderClass: model.builderClass === '' ? undefined : model.builderClass,
      isActive: model.isActive,
    };
  }
}

function emptyModel(): BuilderFormModel {
  return { name: '', description: '', builderClass: '', isActive: true };
}
