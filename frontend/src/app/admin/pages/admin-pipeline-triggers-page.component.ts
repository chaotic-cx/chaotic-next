import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { PIPELINE_OPERATIONS, PipelineScheduleOption, PipelineTriggerAction } from '@chaotic-next/shared-lib';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { Button } from '@openng/optimus-ui/button';
import { Dialog } from '@openng/optimus-ui/dialog';
import { IconField } from '@openng/optimus-ui/iconfield';
import { InputIcon } from '@openng/optimus-ui/inputicon';
import { InputText } from '@openng/optimus-ui/inputtext';
import { Select } from '@openng/optimus-ui/select';
import { TableModule } from '@openng/optimus-ui/table';
import { TagModule } from '@openng/optimus-ui/tag';
import {
  createAdminPagination,
  type StatefulTableRef,
  createDebounced,
  QUERY_SYNC_DEBOUNCE_MS,
  patchQueryParams,
  queryFromRaw,
  queryToQuery,
  restoreQueryParams,
  stringFilterFromQuery,
  stringFilterToQuery,
} from '../admin-url-sync';
import { AdminService } from '../admin.service';
import { ClearFiltersComponent } from '../../empty-state/clear-filters.component';
import { EmptyStateComponent } from '../../empty-state/empty-state.component';
import { LoadErrorComponent } from '../../load-error/load-error.component';
import { MISSING_VALUE } from '../../table-columns/missing-value';
import { TablePageReportDirective } from '../../table-page-report.directive';
import { TABLE_ROW_HEIGHTS } from '../../table-skeleton/table-row-heights';
import { TableSkeletonRowsComponent } from '../../table-skeleton/table-skeleton-rows.component';

const OPERATION_OPTIONS = PIPELINE_OPERATIONS.map((operation) => ({ label: operation, value: operation }));

const REPO_OPTIONS = [
  { label: 'chaotic-aur', value: 'chaotic-aur' },
  { label: 'garuda', value: 'garuda' },
];

@Component({
  selector: 'chaotic-admin-pipeline-triggers-page',
  imports: [
    TableSkeletonRowsComponent,
    DatePipe,
    Button,
    ClearFiltersComponent,
    Dialog,
    EmptyStateComponent,
    FormsModule,
    IconField,
    InputIcon,
    InputText,
    LoadErrorComponent,
    Select,
    TableModule,
    TablePageReportDirective,
    TagModule,
    TranslocoDirective,
  ],
  template: `
    <ng-container *transloco="let t">
      <div class="table-container">
        <p-table
          class="chaotic-stack"
          #pipelineTriggersTable
          [value]="service.pipelineTriggers()?.items ?? []"
          [rows]="pagination.perPage()"
          [paginator]="true"
          [lazy]="true"
          [totalRecords]="service.pipelineTriggersTotal()"
          [chaoticTableFailed]="service.pipelineTriggersStatus.failed()"
          [rowsPerPageOptions]="[25, 50, 100]"
          (onLazyLoad)="onLazyLoad(pipelineTriggersTable, $event)"
          dataKey="id"
          stateStorage="local"
          stateKey="admin-pipeline-triggers-table"
          paginatorDropdownAppendTo="body"
          chaoticPageReport
        >
          <ng-template #caption>
            <div class="flex flex-col gap-2.5 sm:flex-row sm:flex-nowrap sm:items-center">
              <div class="flex flex-wrap items-center gap-2.5 sm:ml-auto">
                <p-button
                  [label]="t('admin.pipelineTriggers.runSchedule')"
                  (onClick)="openScheduleDialog()"
                  icon="pi pi-play"
                  text
                  severity="primary"
                  size="small"
                />
                <p-select
                  [options]="operationOptions"
                  [ngModel]="service.pipelineTriggerOperationFilter()"
                  [placeholder]="t('admin.pipelineTriggers.columns.operation')"
                  [ariaLabel]="t('admin.pipelineTriggers.operationFilterLabel')"
                  (ngModelChange)="setOperationFilter($event)"
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
                  [value]="service.pipelineTriggerQuery()"
                  [placeholder]="t('admin.pipelineTriggers.searchPlaceholder')"
                  [attr.aria-label]="t('admin.pipelineTriggers.searchPlaceholder')"
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
              <th style="min-width: 5rem">{{ t('admin.pipelineTriggers.columns.pipeline') }}</th>
              <th style="min-width: 8rem">{{ t('admin.pipelineTriggers.columns.operation') }}</th>
              <th style="min-width: 14rem">{{ t('admin.pipelineTriggers.columns.inputs') }}</th>
              <th style="min-width: 5rem">{{ t('admin.pipelineTriggers.columns.ref') }}</th>
              <th style="min-width: 6rem">{{ t('admin.pages.columns.commit') }}</th>
              <th style="min-width: 7rem">{{ t('admin.pages.columns.user') }}</th>
              <th style="min-width: 7rem">{{ t('admin.pages.columns.created') }}</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-trigger>
            <tr>
              <td class="stack-meta" [attr.data-label]="t('admin.pages.columns.id')">{{ trigger.id }}</td>
              <td class="stack-title">
                @if (trigger.pipelineId) {
                  @if (trigger.webUrl) {
                    <a
                      class="cursor-pointer text-ctp-mauve hover:underline focus-visible:underline"
                      [href]="trigger.webUrl"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      #{{ trigger.pipelineId }}
                    </a>
                  } @else {
                    #{{ trigger.pipelineId }}
                  }
                } @else {
                  <span class="text-ctp-subtext0">{{ missingValue }}</span>
                }
              </td>
              <td class="stack-sub">
                <p-tag [value]="trigger.operation" [severity]="trigger.operation === 'None' ? 'secondary' : 'info'" />
              </td>
              <td class="stack-body">
                <code class="line-clamp-2 text-sm" [title]="formatInputs(trigger)">{{ formatInputs(trigger) }}</code>
              </td>
              <td class="stack-meta" [attr.data-label]="t('admin.pipelineTriggers.columns.ref')">
                {{ trigger.ref || missingValue }}
              </td>
              <td class="stack-meta" [attr.data-label]="t('admin.pages.columns.commit')">
                @if (trigger.commitSha) {
                  <code class="text-sm">{{ shortSha(trigger.commitSha) }}</code>
                } @else {
                  <span class="text-ctp-subtext0">{{ missingValue }}</span>
                }
              </td>
              <td class="stack-meta" [attr.data-label]="t('admin.pages.columns.user')">
                <span class="font-medium">{{ trigger.userName || missingValue }}</span>
              </td>
              <td class="stack-meta">{{ trigger.createdAt | date: 'short' }}</td>
            </tr>
          </ng-template>
          <ng-template #emptymessage>
            @if (service.pipelineTriggersLoading()) {
              <chaotic-table-skeleton-rows
                [rowHeight]="rowHeights.adminPipelineTriggers"
                [rows]="pagination.perPage()"
                [columns]="8"
              />
            } @else {
              <tr>
                <td [attr.colspan]="8">
                  @if (service.pipelineTriggersStatus.failed()) {
                    <chaotic-load-error
                      [message]="t('admin.pipelineTriggers.loadError')"
                      [error]="service.pipelineTriggersStatus.error()"
                      (retry)="service.pipelineTriggersStatus.reload()"
                    />
                  } @else if (filtersActive()) {
                    <chaotic-empty-state [filtered]="true" (clearFilters)="clearFilters()">
                      <p>{{ t('admin.pipelineTriggers.empty') }}</p>
                    </chaotic-empty-state>
                  } @else {
                    <chaotic-empty-state [hint]="t('admin.pipelineTriggers.firstRun.hint')">
                      <p>{{ t('admin.pipelineTriggers.firstRun.message') }}</p>
                    </chaotic-empty-state>
                  }
                </td>
              </tr>
            }
          </ng-template>
        </p-table>
      </div>

      <p-dialog
        [(visible)]="scheduleDialogVisible"
        [header]="t('admin.pipelineTriggers.scheduleDialog.title')"
        [modal]="true"
        [style]="{ width: '90vw', maxWidth: '500px' }"
        appendTo="body"
      >
        <div class="flex flex-col gap-4 py-2">
          <div class="flex flex-col gap-1.5">
            <label class="font-medium text-ctp-text text-sm" id="repo-select-label" for="repo-select">{{
              t('admin.pipelineTriggers.scheduleDialog.repository')
            }}</label>
            <p-select
              class="w-full"
              [options]="repoOptions"
              [ngModel]="selectedRepo()"
              [placeholder]="t('admin.pipelineTriggers.scheduleDialog.selectRepository')"
              (ngModelChange)="onRepoChange($event)"
              inputId="repo-select"
              ariaLabelledBy="repo-select-label"
              optionLabel="label"
              optionValue="value"
              appendTo="body"
            />
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="font-medium text-ctp-text text-sm" id="schedule-select-label" for="schedule-select">{{
              t('admin.pipelineTriggers.scheduleDialog.schedule')
            }}</label>
            <p-select
              class="w-full"
              [options]="scheduleOptions()"
              [ngModel]="selectedScheduleId()"
              [disabled]="!selectedRepo() || schedulesLoading()"
              [placeholder]="
                selectedRepo()
                  ? t('admin.pipelineTriggers.scheduleDialog.selectSchedule')
                  : t('admin.pipelineTriggers.scheduleDialog.selectRepositoryFirst')
              "
              (ngModelChange)="selectedScheduleId.set($event)"
              inputId="schedule-select"
              ariaLabelledBy="schedule-select-label"
              optionLabel="label"
              optionValue="value"
              appendTo="body"
            />
          </div>

          <div class="flex justify-end gap-2 mt-4">
            <p-button
              [label]="t('common.cancel')"
              (onClick)="scheduleDialogVisible.set(false)"
              type="button"
              severity="secondary"
              text
              size="small"
            />
            <p-button
              [disabled]="!selectedScheduleId() || isSubmitting()"
              [icon]="isSubmitting() ? 'pi pi-spinner pi-spin' : 'pi pi-play'"
              [label]="t('admin.pipelineTriggers.scheduleDialog.title')"
              (onClick)="triggerRunSchedule()"
              type="button"
              severity="primary"
              size="small"
            />
          </div>
        </div>
      </p-dialog>
    </ng-container>
  `,
})
export class AdminPipelineTriggersPageComponent {
  readonly service = inject(AdminService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly transloco = inject(TranslocoService);
  protected readonly rowHeights = TABLE_ROW_HEIGHTS;
  protected readonly missingValue = MISSING_VALUE;

  protected readonly filtersActive = computed(
    () => this.service.pipelineTriggerQuery() !== '' || this.service.pipelineTriggerOperationFilter() !== undefined,
  );

  readonly pagination = createAdminPagination({ router: this.router, route: this.route });

  readonly operationOptions = OPERATION_OPTIONS;
  readonly repoOptions = REPO_OPTIONS;

  private readonly syncSearch = createDebounced(QUERY_SYNC_DEBOUNCE_MS, () =>
    patchQueryParams(this.router, this.route, { q: queryToQuery(this.service.pipelineTriggerQuery()) }),
  );

  readonly scheduleDialogVisible = signal(false);
  readonly selectedScheduleId = signal<number | null>(null);
  readonly selectedRepo = signal<string | null>(null);

  private readonly schedulesResource = httpResource<PipelineScheduleOption[]>(() => {
    const repo = this.selectedRepo();

    return repo ? this.service.getSchedulesRequest(repo) : undefined;
  });

  readonly schedulesLoading = this.schedulesResource.isLoading;
  readonly scheduleOptions = computed(() => {
    const schedules = this.schedulesResource.hasValue() ? this.schedulesResource.value() : [];

    return schedules.map((schedule) => ({
      label:
        schedule.description ??
        this.transloco.translate('admin.pipelineTriggers.scheduleDialog.fallbackLabel', { id: schedule.id }),
      value: schedule.id,
    }));
  });
  readonly isSubmitting = signal(false);

  async openScheduleDialog(): Promise<void> {
    this.selectedScheduleId.set(null);
    this.selectedRepo.set(null);
    this.scheduleDialogVisible.set(true);
  }

  onRepoChange(repo: string): void {
    this.selectedRepo.set(repo);
    this.selectedScheduleId.set(null);
  }

  async triggerRunSchedule(): Promise<void> {
    const id = this.selectedScheduleId();
    const repo = this.selectedRepo();
    if (!id || !repo || this.isSubmitting()) return;

    this.isSubmitting.set(true);
    try {
      const started = await this.service.runSchedule(id, repo);
      if (started) {
        this.scheduleDialogVisible.set(false);
      }
    } finally {
      this.isSubmitting.set(false);
    }
  }

  constructor() {
    this.service.useLists(['pipelineTriggers']);
    this.pagination.restoreFromQuery(this.route);
    this.service.pipelineTriggerPage.set(this.pagination.page());
    this.service.pipelineTriggerPerPage.set(this.pagination.perPage());
    restoreQueryParams(this.route, {
      q: (raw) => this.service.pipelineTriggerQuery.set(queryFromRaw(raw)),
      operation: (raw) => this.service.pipelineTriggerOperationFilter.set(stringFilterFromQuery(raw)),
    });
  }

  shortSha(sha: string): string {
    return sha.slice(0, 8);
  }

  formatInputs(trigger: PipelineTriggerAction): string {
    return Object.entries(trigger.inputs)
      .filter(([key]) => key !== 'operation')
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
  }

  onLazyLoad(table: StatefulTableRef, event: { first?: number; rows?: number | null }): void {
    this.pagination.handleStatefulLazyLoad(table, event);
    this.service.pipelineTriggerPage.set(this.pagination.page());
    this.service.pipelineTriggerPerPage.set(this.pagination.perPage());
  }

  onSearch(event: Event): void {
    this.service.pipelineTriggerQuery.set((event.target as HTMLInputElement).value);
    this.resetToFirstPage();
    this.syncSearch();
  }

  setOperationFilter(value: string | null | undefined): void {
    this.service.pipelineTriggerOperationFilter.set(value ?? undefined);
    this.resetToFirstPage();
    patchQueryParams(this.router, this.route, { operation: stringFilterToQuery(value ?? undefined) });
  }

  clearFilters(): void {
    this.service.pipelineTriggerQuery.set('');
    this.service.pipelineTriggerOperationFilter.set(undefined);
    this.resetToFirstPage();
    patchQueryParams(this.router, this.route, { q: null, operation: null });
  }

  private resetToFirstPage(): void {
    this.pagination.resetPage();
    this.service.pipelineTriggerPage.set(this.pagination.page());
  }
}
