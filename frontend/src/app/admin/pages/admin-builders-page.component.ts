import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { form, FormField, required, submit } from '@angular/forms/signals';
import { ActivatedRoute, Router } from '@angular/router';
import { Builder } from '@chaotic-next/shared-lib';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
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
import {
  createAdminPagination,
  type StatefulTableRef,
  createDebounced,
  patchQueryParams,
  queryFromRaw,
  queryToQuery,
  restoreQueryParams,
  stringFilterToQuery,
} from '../admin-url-sync';
import { TABLE_ROW_HEIGHTS } from '../../table-skeleton/table-row-heights';
import { TableSkeletonRowsComponent } from '../../table-skeleton/table-skeleton-rows.component';

interface BuilderFormModel {
  name: string;
  description: string;
  builderClass: string;
  isActive: boolean;
}

@Component({
  selector: 'chaotic-admin-builders-page',
  imports: [
    TableSkeletonRowsComponent,
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
    TranslocoDirective,
  ],
  template: `
    <ng-container *transloco="let t">
      <div class="table-container">
        <p-table
          #buildersTable
          [value]="service.builders()?.items ?? []"
          [rows]="pagination.perPage()"
          [paginator]="true"
          [lazy]="true"
          [totalRecords]="service.buildersTotal()"
          [showCurrentPageReport]="true"
          [rowsPerPageOptions]="[25, 50, 100]"
          (onLazyLoad)="onLazyLoad(buildersTable, $event)"
          dataKey="id"
          stateStorage="local"
          stateKey="admin-builders-table"
          paginatorDropdownAppendTo="body"
        >
          <ng-template #caption>
            <div class="flex flex-col gap-2.5 sm:flex-row sm:flex-nowrap sm:items-center">
              <div class="hidden sm:ml-auto sm:flex sm:flex-wrap sm:items-center sm:gap-2.5">
                <p-select
                  [options]="service.activeOptions()"
                  [ngModel]="service.builderActiveFilter()"
                  [placeholder]="t('admin.pages.activeStatus')"
                  (ngModelChange)="setActiveFilter($event)"
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
                  [value]="service.builderQuery()"
                  [placeholder]="t('admin.pages.searchName')"
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
              <th style="min-width: 10rem">{{ t('admin.pages.columns.name') }}</th>
              <th style="min-width: 14rem">{{ t('admin.builders.columns.description') }}</th>
              <th style="min-width: 10rem">{{ t('admin.builders.columns.class') }}</th>
              <th style="min-width: 6rem">{{ t('admin.pages.active') }}</th>
              <th class="cell-actions">
                <span class="sr-only">{{ t('admin.pages.columns.actions') }}</span>
              </th>
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
                  <p-tag [value]="t('admin.pages.active')" severity="success" />
                } @else {
                  <p-tag [value]="t('admin.pages.inactive')" severity="secondary" />
                }
              </td>
              <td class="cell-actions">
                <div class="flex items-center justify-end gap-1">
                  <button
                    class="chaotic-icon-btn"
                    [attr.aria-label]="t('admin.pages.editAriaLabel', { name: builder.name })"
                    [pTooltip]="t('common.edit')"
                    (click)="openEdit(builder)"
                    type="button"
                    tooltipPosition="left"
                  >
                    <i class="pi pi-pencil" aria-hidden="true"></i>
                  </button>
                  <button
                    class="chaotic-icon-btn chaotic-icon-btn--danger"
                    [attr.aria-label]="t('admin.pages.deleteAriaLabel', { name: builder.name })"
                    [pTooltip]="t('common.delete')"
                    (click)="confirmDelete(builder)"
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
            @if (service.buildersLoading()) {
              <chaotic-table-skeleton-rows
                [rowHeight]="rowHeights.adminBuilders"
                [rows]="pagination.perPage()"
                [columns]="6"
              />
            } @else {
              <tr>
                <td [attr.colspan]="6">
                  <p class="chaotic-card__empty">{{ t('admin.builders.empty') }}</p>
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
        [header]="t('admin.builders.editDialog.header')"
      >
        <form class="flex flex-col gap-4" (submit)="save(); $event.preventDefault()">
          <label class="flex flex-col gap-1">
            <span class="text-ctp-text text-sm">{{ t('admin.pages.columns.name') }}</span>
            <input [formField]="builderForm.name" pInputText type="text" />
            @if (builderForm.name().touched() && builderForm.name().errors().length) {
              <span class="text-ctp-red text-xs">{{ t('admin.builders.editDialog.nameRequired') }}</span>
            }
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-ctp-text text-sm">{{ t('admin.builders.columns.description') }}</span>
            <input [formField]="builderForm.description" pInputText type="text" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-ctp-text text-sm">{{ t('admin.builders.columns.class') }}</span>
            <input [formField]="builderForm.builderClass" pInputText type="text" />
          </label>
          <div class="flex items-center gap-2">
            <p-checkbox [formField]="builderForm.isActive" [binary]="true" inputId="builderIsActive" />
            <label class="text-ctp-text text-sm" for="builderIsActive">{{ t('admin.pages.active') }}</label>
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
              [disabled]="builderForm().invalid()"
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
export class AdminBuildersPageComponent {
  readonly service = inject(AdminService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly transloco = inject(TranslocoService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly rowHeights = TABLE_ROW_HEIGHTS;

  readonly pagination = createAdminPagination({ router: this.router, route: this.route });

  readonly dialogVisible = signal(false);
  readonly editing = signal<Builder | null>(null);

  private readonly syncSearch = createDebounced(400, () =>
    patchQueryParams(this.router, this.route, { q: queryToQuery(this.service.builderQuery()) }),
  );

  private readonly model = signal<BuilderFormModel>(emptyModel());
  readonly builderForm = form(this.model, (s) => {
    required(s.name);
  });

  constructor() {
    this.service.useLists(['builders']);
    this.pagination.restoreFromQuery(this.route);
    this.service.builderPage.set(this.pagination.page());
    this.service.builderPerPage.set(this.pagination.perPage());
    restoreQueryParams(this.route, {
      q: (raw) => this.service.builderQuery.set(queryFromRaw(raw)),
      active: (raw) => this.service.builderActiveFilter.set(raw === 'true' || raw === 'false' ? raw : undefined),
    });
  }

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
      message: this.transloco.translate('admin.builders.deleteConfirm.message', { name: builder.name }),
      header: this.transloco.translate('admin.builders.deleteConfirm.header'),
      acceptLabel: this.transloco.translate('common.delete'),
      rejectLabel: this.transloco.translate('common.cancel'),
      accept: () => void this.service.deleteBuilder(builder.id),
    });
  }

  onLazyLoad(table: StatefulTableRef, event: { first?: number; rows?: number | null }): void {
    this.pagination.handleStatefulLazyLoad(table, event);
    this.service.builderPage.set(this.pagination.page());
    this.service.builderPerPage.set(event.rows ?? 25);
  }

  onSearch(event: Event): void {
    this.service.builderQuery.set((event.target as HTMLInputElement).value);
    this.pagination.resetPage();
    this.syncSearch();
  }

  setActiveFilter(value: 'true' | 'false' | null | undefined): void {
    this.service.builderActiveFilter.set(value ?? undefined);
    this.pagination.resetPage();
    patchQueryParams(this.router, this.route, { active: stringFilterToQuery(value ?? undefined) });
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
