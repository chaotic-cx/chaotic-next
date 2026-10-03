import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
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
  patchQueryParams,
  queryFromRaw,
  queryToQuery,
  restoreQueryParams,
  stringFilterFromQuery,
  stringFilterToQuery,
} from '../admin-url-sync';
import { AdminService } from '../admin.service';
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
    Dialog,
    FormsModule,
    IconField,
    InputIcon,
    InputText,
    Select,
    TableModule,
    TagModule,
    TranslocoDirective,
  ],
  template: `
    <ng-container *transloco="let t">
      <div class="table-container">
        <p-table
          #pipelineTriggersTable
          [value]="service.pipelineTriggers()?.items ?? []"
          [rows]="pagination.perPage()"
          [paginator]="true"
          [lazy]="true"
          [totalRecords]="service.pipelineTriggersTotal()"
          [showCurrentPageReport]="true"
          [rowsPerPageOptions]="[25, 50, 100]"
          (onLazyLoad)="onLazyLoad(pipelineTriggersTable, $event)"
          dataKey="id"
          stateStorage="local"
          stateKey="admin-pipeline-triggers-table"
          paginatorDropdownAppendTo="body"
        >
          <ng-template #caption>
            <div class="flex flex-col gap-2.5 sm:flex-row sm:flex-nowrap sm:items-center">
              <div class="flex w-full sm:hidden">
                <p-button
                  class="w-full"
                  [label]="t('admin.pipelineTriggers.runSchedule')"
                  (onClick)="openScheduleDialog()"
                  styleClass="w-full justify-center"
                  icon="pi pi-play"
                  text
                  severity="primary"
                />
              </div>
              <div class="hidden sm:ml-auto sm:flex sm:flex-wrap sm:items-center sm:gap-2.5">
                <p-button
                  [label]="t('admin.pipelineTriggers.runSchedule')"
                  (onClick)="openScheduleDialog()"
                  icon="pi pi-play"
                  text
                  severity="primary"
                />
                <p-select
                  [options]="operationOptions"
                  [ngModel]="service.pipelineTriggerOperationFilter()"
                  [placeholder]="t('admin.pipelineTriggers.columns.operation')"
                  (ngModelChange)="setOperationFilter($event)"
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
                  [value]="service.pipelineTriggerQuery()"
                  [placeholder]="t('admin.pipelineTriggers.searchPlaceholder')"
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
              <td>{{ trigger.id }}</td>
              <td>
                @if (trigger.pipelineId) {
                  @if (trigger.webUrl) {
                    <a
                      class="cursor-pointer text-ctp-mauve hover:underline"
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
                  <span class="text-ctp-subtext0">—</span>
                }
              </td>
              <td>
                <p-tag [value]="trigger.operation" [severity]="trigger.operation === 'None' ? 'secondary' : 'info'" />
              </td>
              <td>
                <code class="text-sm">{{ formatInputs(trigger) }}</code>
              </td>
              <td>{{ trigger.ref }}</td>
              <td>
                @if (trigger.commitSha) {
                  <code class="text-sm">{{ shortSha(trigger.commitSha) }}</code>
                } @else {
                  <span class="text-ctp-subtext0">—</span>
                }
              </td>
              <td>
                <span class="font-medium">{{ trigger.userName }}</span>
              </td>
              <td>{{ trigger.createdAt | date: 'short' }}</td>
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
                  <p class="chaotic-card__empty">{{ t('admin.pipelineTriggers.empty') }}</p>
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
            <label class="font-medium text-ctp-text text-sm" for="repo-select">{{
              t('admin.pipelineTriggers.scheduleDialog.repository')
            }}</label>
            <p-select
              class="w-full"
              [options]="repoOptions"
              [ngModel]="selectedRepo()"
              [placeholder]="t('admin.pipelineTriggers.scheduleDialog.selectRepository')"
              (ngModelChange)="onRepoChange($event)"
              inputId="repo-select"
              optionLabel="label"
              optionValue="value"
              appendTo="body"
            />
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="font-medium text-ctp-text text-sm" for="schedule-select">{{
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

  readonly pagination = createAdminPagination({ router: this.router, route: this.route });

  readonly operationOptions = OPERATION_OPTIONS;
  readonly repoOptions = REPO_OPTIONS;

  private readonly syncSearch = createDebounced(400, () =>
    patchQueryParams(this.router, this.route, { q: queryToQuery(this.service.pipelineTriggerQuery()) }),
  );

  readonly scheduleDialogVisible = signal(false);
  readonly scheduleOptions = signal<{ label: string; value: number }[]>([]);
  readonly selectedScheduleId = signal<number | null>(null);
  readonly selectedRepo = signal<string | null>(null);
  readonly schedulesLoading = signal(false);
  readonly isSubmitting = signal(false);

  async openScheduleDialog(): Promise<void> {
    this.selectedScheduleId.set(null);
    this.selectedRepo.set(null);
    this.scheduleOptions.set([]);
    this.scheduleDialogVisible.set(true);
  }

  async onRepoChange(repo: string): Promise<void> {
    this.selectedRepo.set(repo);
    this.selectedScheduleId.set(null);
    this.schedulesLoading.set(true);
    try {
      const schedules = await this.service.getSchedules(repo);
      this.scheduleOptions.set(
        schedules.map((schedule: PipelineScheduleOption) => ({
          label:
            schedule.description ??
            this.transloco.translate('admin.pipelineTriggers.scheduleDialog.fallbackLabel', { id: schedule.id }),
          value: schedule.id,
        })),
      );
    } catch {
      this.scheduleOptions.set([]);
    } finally {
      this.schedulesLoading.set(false);
    }
  }

  async triggerRunSchedule(): Promise<void> {
    const id = this.selectedScheduleId();
    const repo = this.selectedRepo();
    if (!id || !repo || this.isSubmitting()) return;

    this.isSubmitting.set(true);
    try {
      await this.service.runSchedule(id, repo);
      this.scheduleDialogVisible.set(false);
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
    this.service.pipelineTriggerPerPage.set(event.rows ?? 25);
  }

  onSearch(event: Event): void {
    this.service.pipelineTriggerQuery.set((event.target as HTMLInputElement).value);
    this.pagination.resetPage();
    this.syncSearch();
  }

  setOperationFilter(value: string | null | undefined): void {
    this.service.pipelineTriggerOperationFilter.set(value ?? undefined);
    this.pagination.resetPage();
    patchQueryParams(this.router, this.route, { operation: stringFilterToQuery(value ?? undefined) });
  }
}
