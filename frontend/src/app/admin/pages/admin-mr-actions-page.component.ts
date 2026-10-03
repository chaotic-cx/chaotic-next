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
import { ClearFiltersComponent } from '../../empty-state/clear-filters.component';
import { EmptyStateComponent } from '../../empty-state/empty-state.component';
import { commitUrl, mergeRequestUrl } from '../../gitlab-links';
import { injectActiveTranslation } from '../../i18n/active-translation';
import { LoadErrorComponent } from '../../load-error/load-error.component';
import { MISSING_VALUE } from '../../table-columns/missing-value';
import { TablePageReportDirective } from '../../table-page-report.directive';
import { AdminService } from '../admin.service';
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
    ClearFiltersComponent,
    DatePipe,
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
        [chaoticTableFailed]="service.mrActionsStatus.failed()"
        [rowsPerPageOptions]="[25, 50, 100]"
        (onLazyLoad)="onLazyLoad(mrActionsTable, $event)"
        dataKey="id"
        stateStorage="local"
        stateKey="admin-mr-actions-table"
        paginatorDropdownAppendTo="body"
        chaoticPageReport
      >
        <ng-template #caption>
          <div class="flex flex-col gap-2.5 sm:flex-row sm:flex-nowrap sm:items-center">
            <div class="flex flex-wrap items-center gap-2.5 sm:ml-auto">
              <p-select
                [options]="actionOptions()"
                [ngModel]="service.mrActionActionFilter()"
                [placeholder]="t('mrActions.columns.action')"
                [ariaLabel]="t('mrActions.actionFilterLabel')"
                (ngModelChange)="setActionFilter($event)"
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
                [value]="service.mrActionQuery()"
                [placeholder]="t('mrActions.searchPlaceholder')"
                [attr.aria-label]="t('mrActions.searchPlaceholder')"
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
                class="cursor-pointer text-ctp-mauve hover:underline focus-visible:underline"
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
                  class="cursor-pointer text-ctp-mauve hover:underline focus-visible:underline"
                  [href]="commitUrl(action.commitSha)"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <code class="text-sm">{{ shortSha(action.commitSha) }}</code>
                </a>
              } @else {
                <span class="text-ctp-subtext0">{{ missingValue }}</span>
              }
            </td>
            <td>
              @if (action.reason) {
                <span class="block max-w-64 truncate" [pTooltip]="action.reason" tooltipPosition="top">{{
                  action.reason
                }}</span>
              } @else {
                <span class="text-ctp-subtext0">{{ missingValue }}</span>
              }
            </td>
            <td>
              <span class="font-medium">{{ action.userName || missingValue }}</span>
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
                @if (service.mrActionsStatus.failed()) {
                  <chaotic-load-error
                    [message]="t('mrActions.loadError')"
                    [error]="service.mrActionsStatus.error()"
                    (retry)="service.mrActionsStatus.reload()"
                  />
                } @else if (filtersActive()) {
                  <chaotic-empty-state [filtered]="true" (clearFilters)="clearFilters()">
                    <p>{{ t('mrActions.empty') }}</p>
                  </chaotic-empty-state>
                } @else {
                  <chaotic-empty-state [hint]="t('mrActions.firstRun.hint')">
                    <p>{{ t('mrActions.firstRun.message') }}</p>
                  </chaotic-empty-state>
                }
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
  protected readonly missingValue = MISSING_VALUE;

  protected readonly filtersActive = computed(
    () => this.service.mrActionQuery() !== '' || this.service.mrActionActionFilter() !== undefined,
  );

  readonly pagination = createAdminPagination({ router: this.router, route: this.route });

  readonly actionOptions = computed(() => {
    this.activeTranslation();

    return ACTION_OPTIONS.map((option) => ({
      label: this.transloco.translate(option.labelKey),
      value: option.value,
    }));
  });

  private readonly syncSearch = createDebounced(QUERY_SYNC_DEBOUNCE_MS, () =>
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
    this.service.mrActionPerPage.set(this.pagination.perPage());
  }

  onSearch(event: Event): void {
    this.service.mrActionQuery.set((event.target as HTMLInputElement).value);
    this.resetToFirstPage();
    this.syncSearch();
  }

  setActionFilter(value: string | null | undefined): void {
    this.service.mrActionActionFilter.set(value ?? undefined);
    this.resetToFirstPage();
    patchQueryParams(this.router, this.route, { action: stringFilterToQuery(value ?? undefined) });
  }

  clearFilters(): void {
    this.service.mrActionQuery.set('');
    this.service.mrActionActionFilter.set(undefined);
    this.resetToFirstPage();
    patchQueryParams(this.router, this.route, { q: null, action: null });
  }

  private resetToFirstPage(): void {
    this.pagination.resetPage();
    this.service.mrActionPage.set(this.pagination.page());
  }
}
