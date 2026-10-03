import { DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MrAction } from '@chaotic-next/shared-lib';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { IconField } from '@openng/optimus-ui/iconfield';
import { InputIcon } from '@openng/optimus-ui/inputicon';
import { InputText } from '@openng/optimus-ui/inputtext';
import { Select } from '@openng/optimus-ui/select';
import { TableModule } from '@openng/optimus-ui/table';
import { TagModule } from '@openng/optimus-ui/tag';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { commitUrl, mergeRequestUrl } from '../../gitlab-links';
import { injectActiveTranslation } from '../../i18n/active-translation';
import { AdminService } from '../admin.service';
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
import { TABLE_ROW_HEIGHTS } from '../../table-skeleton/table-row-heights';
import { TableSkeletonRowsComponent } from '../../table-skeleton/table-skeleton-rows.component';

const ACTION_SEVERITY: Record<string, TagSeverity> = {
  approve: 'success',
  dangerous: 'danger',
  hold: 'warn',
};

const ACTION_OPTIONS = [
  { labelKey: marker('admin.mrActions.actions.approve'), value: 'approve' },
  { labelKey: marker('admin.mrActions.actions.dangerous'), value: 'dangerous' },
  { labelKey: marker('admin.mrActions.actions.hold'), value: 'hold' },
];

type TagSeverity = 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast' | null | undefined;

@Component({
  selector: 'chaotic-admin-mr-actions-page',
  imports: [
    TableSkeletonRowsComponent,
    DatePipe,
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
    <div class="table-container" *transloco="let t; prefix: 'admin'">
      <p-table
        #mrActionsTable
        [value]="service.mrActions()?.items ?? []"
        [rows]="pagination.perPage()"
        [paginator]="true"
        [lazy]="true"
        [totalRecords]="service.mrActionsTotal()"
        [showCurrentPageReport]="true"
        [rowsPerPageOptions]="[25, 50, 100]"
        (onLazyLoad)="onLazyLoad(mrActionsTable, $event)"
        dataKey="id"
        stateStorage="local"
        stateKey="admin-mr-actions-table"
        paginatorDropdownAppendTo="body"
      >
        <ng-template #caption>
          <div class="flex flex-col gap-2.5 sm:flex-row sm:flex-nowrap sm:items-center">
            <div class="hidden sm:ml-auto sm:flex sm:flex-wrap sm:items-center sm:gap-2.5">
              <p-select
                [options]="actionOptions()"
                [ngModel]="service.mrActionActionFilter()"
                [placeholder]="t('mrActions.columns.action')"
                (ngModelChange)="setActionFilter($event)"
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
                [value]="service.mrActionQuery()"
                [placeholder]="t('mrActions.searchPlaceholder')"
                (input)="onSearch($event)"
                pInputText
                type="text"
              />
            </p-iconfield>
          </div>
        </ng-template>
        <ng-template #header>
          <tr>
            <th style="min-width: 3rem">{{ t('pages.columns.id') }}</th>
            <th style="min-width: 5rem">{{ t('mrActions.columns.mr') }}</th>
            <th style="min-width: 7rem">{{ t('mrActions.columns.action') }}</th>
            <th style="min-width: 6rem">{{ t('pages.columns.commit') }}</th>
            <th style="min-width: 12rem">{{ t('mrActions.columns.reason') }}</th>
            <th style="min-width: 8rem">{{ t('pages.columns.user') }}</th>
            <th style="min-width: 7rem">{{ t('pages.columns.created') }}</th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-action>
          <tr>
            <td>{{ action.id }}</td>
            <td>
              <a
                class="cursor-pointer text-ctp-mauve hover:underline"
                [href]="mrUrl(action.mergeRequestIid)"
                target="_blank"
                rel="noopener noreferrer"
              >
                !{{ action.mergeRequestIid }}
              </a>
            </td>
            <td>
              <p-tag [value]="action.action" [severity]="severity(action)" />
            </td>
            <td>
              @if (action.commitSha) {
                <a
                  class="cursor-pointer text-ctp-mauve hover:underline"
                  [href]="commitUrl(action.commitSha)"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <code class="text-sm">{{ shortSha(action.commitSha) }}</code>
                </a>
              } @else {
                <span class="text-ctp-subtext0">—</span>
              }
            </td>
            <td>
              @if (action.reason) {
                <span class="block max-w-64 truncate" [pTooltip]="action.reason" tooltipPosition="top">{{
                  action.reason
                }}</span>
              } @else {
                <span class="text-ctp-subtext0">—</span>
              }
            </td>
            <td>
              <span class="font-medium">{{ action.userName }}</span>
            </td>
            <td>{{ action.createdAt | date: 'short' }}</td>
          </tr>
        </ng-template>
        <ng-template #emptymessage>
          @if (service.mrActionsLoading()) {
            <chaotic-table-skeleton-rows
              [rowHeight]="rowHeights.adminMrActions"
              [rows]="pagination.perPage()"
              [columns]="7"
            />
          } @else {
            <tr>
              <td [attr.colspan]="7">
                <p class="chaotic-card__empty">{{ t('mrActions.empty') }}</p>
              </td>
            </tr>
          }
        </ng-template>
      </p-table>
    </div>
  `,
})
export class AdminMrActionsPageComponent {
  readonly service = inject(AdminService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly transloco = inject(TranslocoService);
  private readonly activeTranslation = injectActiveTranslation();
  protected readonly rowHeights = TABLE_ROW_HEIGHTS;

  readonly pagination = createAdminPagination({ router: this.router, route: this.route });

  readonly actionOptions = computed(() => {
    this.activeTranslation();

    return ACTION_OPTIONS.map((option) => ({
      label: this.transloco.translate(option.labelKey),
      value: option.value,
    }));
  });

  private readonly syncSearch = createDebounced(400, () =>
    patchQueryParams(this.router, this.route, { q: queryToQuery(this.service.mrActionQuery()) }),
  );

  constructor() {
    this.service.useLists(['mrActions']);
    this.pagination.restoreFromQuery(this.route);
    this.service.mrActionPage.set(this.pagination.page());
    this.service.mrActionPerPage.set(this.pagination.perPage());
    restoreQueryParams(this.route, {
      q: (raw) => this.service.mrActionQuery.set(queryFromRaw(raw)),
      action: (raw) => this.service.mrActionActionFilter.set(stringFilterFromQuery(raw)),
    });
  }

  severity(action: MrAction): TagSeverity {
    return ACTION_SEVERITY[action.action] ?? 'secondary';
  }

  shortSha(sha: string): string {
    return sha.slice(0, 8);
  }

  readonly commitUrl = commitUrl;
  readonly mrUrl = mergeRequestUrl;

  onLazyLoad(table: StatefulTableRef, event: { first?: number; rows?: number | null }): void {
    this.pagination.handleStatefulLazyLoad(table, event);
    this.service.mrActionPage.set(this.pagination.page());
    this.service.mrActionPerPage.set(event.rows ?? 25);
  }

  onSearch(event: Event): void {
    this.service.mrActionQuery.set((event.target as HTMLInputElement).value);
    this.pagination.resetPage();
    this.syncSearch();
  }

  setActionFilter(value: string | null | undefined): void {
    this.service.mrActionActionFilter.set(value ?? undefined);
    this.pagination.resetPage();
    patchQueryParams(this.router, this.route, { action: stringFilterToQuery(value ?? undefined) });
  }
}
