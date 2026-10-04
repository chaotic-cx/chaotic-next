import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { form, FormField, required, submit } from '@angular/forms/signals';
import { ActivatedRoute, Router } from '@angular/router';
import { Builder } from '@chaotic-next/shared-lib';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';
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
import { ClearFiltersComponent } from '../../empty-state/clear-filters.component';
import { EmptyStateComponent } from '../../empty-state/empty-state.component';
import { LoadErrorComponent } from '../../load-error/load-error.component';
import { MISSING_VALUE } from '../../table-columns/missing-value';
import { TablePageReportDirective } from '../../table-page-report.directive';
import { AdminService, BuilderFormData } from '../admin.service';
import {
  createAdminPagination,
  type StatefulTableRef,
  createDebounced,
  QUERY_SYNC_DEBOUNCE_MS,
  patchQueryParams,
  queryFromRaw,
  queryToQuery,
  restoreQueryParams,
  stringFilterToQuery,
} from '../admin-url-sync';
import { EditConflictGuard } from '../edit-conflict';
import { EditConflictNoticeComponent } from '../edit-conflict-notice.component';
import { TABLE_ROW_HEIGHTS } from '../../table-skeleton/table-row-heights';
import { TableSkeletonRowsComponent } from '../../table-skeleton/table-skeleton-rows.component';

interface BuilderFormModel {
  name: string;
  description: string;
  builderClass: string;
  isActive: boolean;
}

function builderConflictFields(builder: Builder): Record<string, unknown> {
  return {
    name: builder.name,
    description: builder.description,
    builderClass: builder.builderClass,
    isActive: builder.isActive,
  };
}

@Component({
  selector: 'chaotic-admin-builders-page',
  imports: [
    TableSkeletonRowsComponent,
    EditConflictNoticeComponent,
    Button,
    Checkbox,
    ClearFiltersComponent,
    Dialog,
    EmptyStateComponent,
    FormField,
    FormsModule,
    IconField,
    InputIcon,
    InputText,
    LoadErrorComponent,
    Select,
    TableModule,
    TablePageReportDirective,
    TagModule,
    Tooltip,
    TranslocoDirective,
  ],
  template: `
    <ng-container *transloco="let t">
      <div class="table-container">
        <p-table
          class="chaotic-stack"
          #buildersTable
          [value]="service.builders()?.items ?? []"
          [rows]="pagination.perPage()"
          [paginator]="true"
          [lazy]="true"
          [totalRecords]="service.buildersTotal()"
          [chaoticTableFailed]="service.buildersStatus.failed()"
          [rowsPerPageOptions]="[25, 50, 100]"
          (onLazyLoad)="onLazyLoad(buildersTable, $event)"
          dataKey="id"
          stateStorage="local"
          stateKey="admin-builders-table"
          paginatorDropdownAppendTo="body"
          chaoticPageReport
        >
          <ng-template #caption>
            <div class="flex flex-col gap-2.5 sm:flex-row sm:flex-nowrap sm:items-center">
              <div class="flex flex-wrap items-center gap-2.5 sm:ml-auto">
                <p-select
                  [options]="service.activeOptions()"
                  [ngModel]="service.builderActiveFilter()"
                  [placeholder]="t('admin.pages.activeStatus')"
                  [ariaLabel]="t('admin.pages.activeStatus')"
                  (ngModelChange)="setActiveFilter($event)"
                  optionLabel="label"
                  optionValue="value"
                  showClear
                  appendTo="body"
                />
                <chaotic-clear-filters [active]="filtersActive()" (clear)="clearFilters()" />
              </div>
              <p-iconfield class="w-full sm:w-64" iconPosition="left">
                <p-inputicon>
                  <i class="pi pi-search" aria-hidden="true"></i>
                </p-inputicon>
                <input
                  class="w-full"
                  [value]="service.builderQuery()"
                  [placeholder]="t('admin.pages.searchName')"
                  [attr.aria-label]="t('admin.pages.searchName')"
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
              <td class="stack-meta" [attr.data-label]="t('admin.pages.columns.id')">{{ builder.id }}</td>
              <td class="stack-title">
                <span class="block max-w-xs truncate" [title]="builder.name">{{ builder.name }}</span>
              </td>
              <td class="text-ctp-subtext stack-body">
                @if (builder.description) {
                  <span class="line-clamp-2" [title]="builder.description">{{ builder.description }}</span>
                } @else {
                  {{ missingValue }}
                }
              </td>
              <td class="stack-meta" [attr.data-label]="t('admin.builders.columns.class')">
                {{ builder.builderClass || missingValue }}
              </td>
              <td class="stack-meta">
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
                  @if (service.buildersStatus.failed()) {
                    <chaotic-load-error
                      [message]="t('admin.builders.loadError')"
                      [error]="service.buildersStatus.error()"
                      (retry)="service.buildersStatus.reload()"
                    />
                  } @else if (filtersActive()) {
                    <chaotic-empty-state [filtered]="true" (clearFilters)="clearFilters()">
                      <p>{{ t('admin.builders.empty') }}</p>
                    </chaotic-empty-state>
                  } @else {
                    <chaotic-empty-state>
                      <p>{{ t('admin.builders.firstRun.message') }}</p>
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
        [header]="t('admin.builders.editDialog.header')"
      >
        <form class="flex flex-col gap-4" (submit)="save(); $event.preventDefault()">
          <label class="flex flex-col gap-1">
            <span class="text-ctp-text text-sm">
              {{ t('admin.pages.columns.name') }}
              <span class="text-ctp-red" aria-hidden="true">*</span>
            </span>
            <input
              [formField]="builderForm.name"
              [attr.aria-invalid]="showNameError()"
              [attr.aria-describedby]="showNameError() ? 'builder-name-error' : null"
              pInputText
              type="text"
            />
            @if (showNameError()) {
              <span class="text-ctp-red text-xs" id="builder-name-error">{{
                t('admin.builders.editDialog.nameRequired')
              }}</span>
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
              [disabled]="builderForm().invalid()"
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
export class AdminBuildersPageComponent {
  readonly service = inject(AdminService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly transloco = inject(TranslocoService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly rowHeights = TABLE_ROW_HEIGHTS;
  protected readonly missingValue = MISSING_VALUE;

  protected readonly filtersActive = computed(
    () => this.service.builderQuery() !== '' || this.service.builderActiveFilter() !== undefined,
  );

  readonly pagination = createAdminPagination({ router: this.router, route: this.route });

  readonly dialogVisible = signal(false);
  readonly editing = signal<Builder | null>(null);
  protected readonly conflict = new EditConflictGuard<Builder>(builderConflictFields);
  protected readonly conflictMessageKey = marker('admin.editConflict.messages.builder');

  private readonly syncSearch = createDebounced(QUERY_SYNC_DEBOUNCE_MS, () =>
    patchQueryParams(this.router, this.route, { q: queryToQuery(this.service.builderQuery()) }),
  );

  private readonly model = signal<BuilderFormModel>(emptyModel());
  readonly builderForm = form(this.model, (s) => {
    required(s.name);
  });

  protected readonly showNameError = computed(() => {
    const name = this.builderForm.name();
    return name.touched() && name.errors().length > 0;
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
    this.conflict.begin(builder);
    this.editing.set(builder);
    this.fillForm(builder);
    this.dialogVisible.set(true);
  }

  private fillForm(builder: Builder): void {
    this.model.set({
      name: builder.name,
      description: builder.description ?? '',
      builderClass: builder.builderClass ?? '',
      isActive: builder.isActive ?? true,
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
    submit(this.builderForm, async () => {
      const current = this.editing();
      if (!current) {
        this.dialogVisible.set(false);
        return;
      }

      const unchanged = await this.conflict.confirmUnchanged(() => this.service.findBuilder(current));
      if (!unchanged) {
        return;
      }

      const saved = await this.service.updateBuilder(current.id, this.toFormData(this.model()));
      if (saved) {
        this.dialogVisible.set(false);
      }
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
    this.service.builderPerPage.set(this.pagination.perPage());
  }

  onSearch(event: Event): void {
    this.service.builderQuery.set((event.target as HTMLInputElement).value);
    this.resetToFirstPage();
    this.syncSearch();
  }

  setActiveFilter(value: 'true' | 'false' | null | undefined): void {
    this.service.builderActiveFilter.set(value ?? undefined);
    this.resetToFirstPage();
    patchQueryParams(this.router, this.route, { active: stringFilterToQuery(value ?? undefined) });
  }

  clearFilters(): void {
    this.service.builderQuery.set('');
    this.service.builderActiveFilter.set(undefined);
    this.resetToFirstPage();
    patchQueryParams(this.router, this.route, { q: null, active: null });
  }

  private resetToFirstPage(): void {
    this.pagination.resetPage();
    this.service.builderPage.set(this.pagination.page());
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
