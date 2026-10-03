import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FormField, form, required, submit } from '@angular/forms/signals';
import { ActivatedRoute, Router } from '@angular/router';
import { Repo } from '@chaotic-next/shared-lib';
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
import { AdminService, RepoFormData } from '../admin.service';
import { createDebounced, patchQueryParams, restoreQueryParams, stringFilterToQuery } from '../admin-url-sync';
import { TABLE_ROW_HEIGHTS } from '../../table-skeleton/table-row-heights';
import { TableSkeletonRowsComponent } from '../../table-skeleton/table-skeleton-rows.component';

interface RepoFormModel {
  name: string;
  repoUrl: string;
  isActive: boolean;
  gitRef: string;
  dbPath: string;
  gitlabProjectId: string;
  apiToken: string;
}

@Component({
  selector: 'chaotic-admin-repos-page',
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
        <p-table [value]="filteredRepos()" dataKey="id">
          <ng-template #caption>
            <div class="flex flex-col gap-2.5 sm:flex-row sm:flex-nowrap sm:items-center">
              <div class="hidden sm:ml-auto sm:flex sm:flex-wrap sm:items-center sm:gap-2.5">
                <p-select
                  [options]="service.activeOptions()"
                  [ngModel]="activeFilter()"
                  [placeholder]="t('admin.pages.activeStatus')"
                  (ngModelChange)="onActiveChange($event)"
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
                  [value]="query()"
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
              <th style="min-width: 8rem">{{ t('admin.repos.fields.gitRef') }}</th>
              <th style="min-width: 12rem">{{ t('admin.repos.fields.repoUrl') }}</th>
              <th style="min-width: 6rem">{{ t('admin.pages.active') }}</th>
              <th class="cell-actions">
                <span class="sr-only">{{ t('admin.pages.columns.actions') }}</span>
              </th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-repo>
            <tr>
              <td>{{ repo.id }}</td>
              <td>{{ repo.name }}</td>
              <td>{{ repo.gitRef }}</td>
              <td class="text-ctp-subtext">{{ repo.repoUrl }}</td>
              <td>
                @if (repo.isActive) {
                  <p-tag [value]="t('admin.pages.active')" severity="success" />
                } @else {
                  <p-tag [value]="t('admin.pages.inactive')" severity="secondary" />
                }
              </td>
              <td class="cell-actions">
                <div class="flex items-center justify-end gap-1">
                  <button
                    class="chaotic-icon-btn"
                    [attr.aria-label]="t('admin.pages.editAriaLabel', { name: repo.name })"
                    [pTooltip]="t('common.edit')"
                    (click)="openEdit(repo)"
                    type="button"
                    tooltipPosition="left"
                  >
                    <i class="pi pi-pencil" aria-hidden="true"></i>
                  </button>
                  <button
                    class="chaotic-icon-btn chaotic-icon-btn--danger"
                    [attr.aria-label]="t('admin.pages.deleteAriaLabel', { name: repo.name })"
                    [pTooltip]="t('common.delete')"
                    (click)="confirmDelete(repo)"
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
            @if (service.reposLoading()) {
              <chaotic-table-skeleton-rows [rowHeight]="rowHeights.adminRepos" [columns]="6" />
            } @else {
              <tr>
                <td [attr.colspan]="6">
                  <p class="chaotic-card__empty">{{ t('admin.repos.empty') }}</p>
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
        [header]="t('admin.repos.editDialog.header')"
      >
        <form class="flex flex-col gap-4" (submit)="save(); $event.preventDefault()">
          <label class="flex flex-col gap-1">
            <span class="text-ctp-text text-sm">{{ t('admin.pages.columns.name') }}</span>
            <input [formField]="repoForm.name" pInputText type="text" />
            @if (repoForm.name().touched() && repoForm.name().errors().length) {
              <span class="text-ctp-red text-xs">{{ t('admin.repos.editDialog.nameRequired') }}</span>
            }
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-ctp-text text-sm">{{ t('admin.repos.fields.repoUrl') }}</span>
            <input [formField]="repoForm.repoUrl" pInputText type="text" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-ctp-text text-sm">{{ t('admin.repos.fields.gitRef') }}</span>
            <input [formField]="repoForm.gitRef" pInputText type="text" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-ctp-text text-sm">{{ t('admin.repos.fields.dbPath') }}</span>
            <input [formField]="repoForm.dbPath" pInputText type="text" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-ctp-text text-sm">{{ t('admin.repos.fields.gitlabProjectId') }}</span>
            <input [formField]="repoForm.gitlabProjectId" pInputText type="text" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-ctp-text text-sm">{{ t('admin.repos.fields.apiToken') }}</span>
            <input [formField]="repoForm.apiToken" pInputText type="password" autocomplete="off" />
            <span class="text-ctp-subtext text-xs">
              @if (editing()) {
                {{ t('admin.repos.editDialog.apiTokenKeepHint') }}
              } @else {
                {{ t('admin.repos.editDialog.apiTokenHint') }}
              }
            </span>
          </label>
          <div class="flex items-center gap-2">
            <p-checkbox [formField]="repoForm.isActive" [binary]="true" inputId="repoIsActive" />
            <label class="text-ctp-text text-sm" for="repoIsActive">{{ t('admin.pages.active') }}</label>
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
              [disabled]="repoForm().invalid()"
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
export class AdminReposPageComponent {
  readonly service = inject(AdminService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly transloco = inject(TranslocoService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly rowHeights = TABLE_ROW_HEIGHTS;

  readonly dialogVisible = signal(false);
  readonly editing = signal<Repo | null>(null);

  readonly activeFilter = signal<'active' | 'inactive' | undefined>(undefined);
  readonly query = signal('');

  private readonly syncSearch = createDebounced(400, () =>
    patchQueryParams(this.router, this.route, { q: this.query() === '' ? null : this.query() }),
  );

  constructor() {
    this.service.useLists(['repos']);
    restoreQueryParams(this.route, {
      q: (raw) => this.query.set(raw ?? ''),
      active: (raw) => this.activeFilter.set(raw === 'active' || raw === 'inactive' ? raw : undefined),
    });
  }

  readonly filteredRepos = computed(() => {
    const repos = this.service.repos() ?? [];
    const filter = this.activeFilter();
    const q = this.query().trim().toLowerCase();
    return repos.filter((repo) => {
      const matchesActive = !filter || (filter === 'active' ? repo.isActive : !repo.isActive);
      const matchesQuery = !q || repo.name.toLowerCase().includes(q);
      return matchesActive && matchesQuery;
    });
  });

  onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.syncSearch();
  }

  onActiveChange(value: 'active' | 'inactive' | null | undefined): void {
    this.activeFilter.set(value ?? undefined);
    patchQueryParams(this.router, this.route, { active: stringFilterToQuery(value ?? undefined) });
  }

  private readonly model = signal<RepoFormModel>(emptyModel());
  readonly repoForm = form(this.model, (s) => {
    required(s.name);
  });

  openEdit(repo: Repo): void {
    this.editing.set(repo);
    this.model.set({
      name: repo.name,
      repoUrl: repo.repoUrl ?? '',
      isActive: repo.isActive,
      gitRef: repo.gitRef,
      dbPath: repo.dbPath ?? '',
      gitlabProjectId: repo.gitlabProjectId ?? '',
      apiToken: '',
    });
    this.dialogVisible.set(true);
  }

  save(): void {
    submit(this.repoForm, async () => {
      const data = this.toFormData(this.model());
      const current = this.editing();
      if (current) await this.service.updateRepo(current.id, data);
      this.dialogVisible.set(false);
    });
  }

  confirmDelete(repo: Repo): void {
    this.confirmationService.confirm({
      message: this.transloco.translate('admin.repos.deleteConfirm.message', { name: repo.name }),
      header: this.transloco.translate('admin.repos.deleteConfirm.header'),
      acceptLabel: this.transloco.translate('common.delete'),
      rejectLabel: this.transloco.translate('common.cancel'),
      accept: () => void this.service.deleteRepo(repo.id),
    });
  }

  private toFormData(model: RepoFormModel): RepoFormData {
    return {
      name: model.name,
      repoUrl: model.repoUrl === '' ? undefined : model.repoUrl,
      isActive: model.isActive,
      gitRef: model.gitRef === '' ? 'main' : model.gitRef,
      dbPath: model.dbPath === '' ? undefined : model.dbPath,
      gitlabProjectId: model.gitlabProjectId === '' ? undefined : model.gitlabProjectId,
      apiToken: model.apiToken === '' ? undefined : model.apiToken,
    };
  }
}

function emptyModel(): RepoFormModel {
  return { name: '', repoUrl: '', isActive: true, gitRef: 'main', dbPath: '', gitlabProjectId: '', apiToken: '' };
}
