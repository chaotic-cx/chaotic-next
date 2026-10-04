import { DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PackageBump } from '@chaotic-next/shared-lib';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';
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
} from '../admin-url-sync';
import { AdminService } from '../admin.service';
import { ClearFiltersComponent } from '../../empty-state/clear-filters.component';
import { EmptyStateComponent } from '../../empty-state/empty-state.component';
import { LoadErrorComponent } from '../../load-error/load-error.component';
import { MISSING_VALUE } from '../../table-columns/missing-value';
import { TablePageReportDirective } from '../../table-page-report.directive';
import { injectActiveTranslation } from '../../i18n/active-translation';
import { TABLE_ROW_HEIGHTS } from '../../table-skeleton/table-row-heights';
import { TableSkeletonRowsComponent } from '../../table-skeleton/table-skeleton-rows.component';

const BUMP_TYPES = [
  { labelKey: marker('admin.packageBumps.bumpTypes.explicit'), value: 0 },
  { labelKey: marker('admin.packageBumps.bumpTypes.global'), value: 1 },
  { labelKey: marker('admin.packageBumps.bumpTypes.fromDeps'), value: 2 },
  { labelKey: marker('admin.packageBumps.bumpTypes.fromDepsChaotic'), value: 3 },
  { labelKey: marker('admin.packageBumps.bumpTypes.plugin'), value: 6 },
  { labelKey: marker('admin.packageBumps.bumpTypes.brokenDeps'), value: 7 },
  { labelKey: marker('admin.packageBumps.bumpTypes.manual'), value: 8 },
];

const SOURCE_OPTIONS = [
  { label: 'Arch', value: 0 },
  { label: 'Chaotic', value: 1 },
];

const SOURCE_LABELS: Record<number, string> = {
  0: 'arch',
  1: 'chaotic',
};

const BUMP_TYPE_MANUAL = 8;

type TagSeverity = 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast' | null | undefined;

@Component({
  selector: 'chaotic-admin-package-bumps-page',
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
    RouterLink,
    TranslocoDirective,
  ],
  template: `
    <div class="table-container" *transloco="let t; prefix: 'admin'">
      <p-table
        class="chaotic-stack"
        #bumpsTable
        [value]="service.packageBumps()?.items ?? []"
        [rows]="pagination.perPage()"
        [paginator]="true"
        [lazy]="true"
        [totalRecords]="service.packageBumpsTotal()"
        [chaoticTableFailed]="service.packageBumpsStatus.failed()"
        [rowsPerPageOptions]="[25, 50, 100]"
        (onLazyLoad)="onLazyLoad(bumpsTable, $event)"
        dataKey="id"
        stateStorage="local"
        stateKey="admin-bumps-table"
        paginatorDropdownAppendTo="body"
        chaoticPageReport
      >
        <ng-template #caption>
          <div class="flex flex-col gap-2.5 sm:flex-row sm:flex-nowrap sm:items-center">
            <div class="flex flex-wrap items-center gap-2.5 sm:ml-auto">
              <p-select
                [options]="bumpTypeOptions()"
                [ngModel]="service.packageBumpTypeFilter()"
                [placeholder]="t('packageBumps.columns.bumpType')"
                [ariaLabel]="t('packageBumps.bumpTypeFilterLabel')"
                (ngModelChange)="setBumpTypeFilter($event)"
                optionLabel="label"
                optionValue="value"
                showClear
                appendTo="body"
              />
              <p-select
                [options]="sourceOptions"
                [ngModel]="service.packageBumpSourceFilter()"
                [placeholder]="t('packageBumps.source')"
                [ariaLabel]="t('packageBumps.sourceFilterLabel')"
                (ngModelChange)="setSourceFilter($event)"
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
                [value]="service.packageBumpQuery()"
                [placeholder]="t('pages.searchPkgname')"
                [attr.aria-label]="t('pages.searchPkgname')"
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
            <th style="min-width: 10rem">{{ t('pages.columns.package') }}</th>
            <th style="min-width: 7rem">{{ t('packageBumps.columns.bumpType') }}</th>
            <th style="min-width: 10rem">{{ t('packageBumps.columns.trigger') }}</th>
            <th style="min-width: 7rem">{{ t('packageBumps.columns.triggeredBy') }}</th>
            <th style="min-width: 12rem">{{ t('packageBumps.columns.details') }}</th>
            <th style="min-width: 7rem">{{ t('packageBumps.columns.timestamp') }}</th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-bump>
          <tr>
            <td class="stack-meta" [attr.data-label]="t('pages.columns.id')">{{ bump.id }}</td>
            <td class="stack-title">
              @if (bump.pkgname) {
                <a
                  class="block max-w-xs cursor-pointer truncate text-ctp-mauve hover:underline focus-visible:underline"
                  [queryParams]="{ q: bump.pkgname }"
                  [title]="bump.pkgname"
                  routerLink="/admin/packages"
                >
                  {{ bump.pkgname }}
                </a>
              } @else {
                <span class="text-ctp-subtext0">{{ missingValue }}</span>
              }
            </td>
            <td class="stack-meta" [attr.data-label]="t('packageBumps.columns.bumpType')">
              <p-tag [value]="bumpTypeLabel(bump.bumpType)" severity="secondary" />
            </td>
            <td class="stack-sub" [attr.data-label]="t('packageBumps.columns.trigger')">
              @if (bump.triggerName) {
                <a
                  class="block max-w-xs cursor-pointer truncate text-ctp-mauve hover:underline focus-visible:underline"
                  [routerLink]="triggerLink(bump.triggerFrom)"
                  [queryParams]="{ q: bump.triggerName }"
                  [title]="bump.triggerName"
                >
                  {{ bump.triggerName }}
                </a>
              } @else {
                <span class="text-ctp-subtext0">{{ missingValue }}</span>
              }
            </td>
            <td class="stack-meta" [attr.data-label]="t('packageBumps.columns.triggeredBy')">
              @if (bump.bumpType === manualBumpType) {
                <p-tag [value]="t('packageBumps.bumpTypes.manual')" severity="success" />
              } @else {
                <p-tag [value]="sourceLabel(bump.triggerFrom)" [severity]="sourceSeverity(bump.triggerFrom)" />
              }
            </td>
            <td class="text-ctp-subtext stack-body">
              <span class="line-clamp-2" [title]="detailsText(bump)">{{ detailsText(bump) }}</span>
            </td>
            <td class="stack-meta">{{ bump.timestamp | date: 'short' }}</td>
          </tr>
        </ng-template>
        <ng-template #emptymessage>
          @if (service.packageBumpsLoading()) {
            <chaotic-table-skeleton-rows
              [rowHeight]="rowHeights.adminPackageBumps"
              [rows]="pagination.perPage()"
              [columns]="7"
            />
          } @else {
            <tr>
              <td [attr.colspan]="7">
                @if (service.packageBumpsStatus.failed()) {
                  <chaotic-load-error
                    [message]="t('packageBumps.loadError')"
                    [error]="service.packageBumpsStatus.error()"
                    (retry)="service.packageBumpsStatus.reload()"
                  />
                } @else if (filtersActive()) {
                  <chaotic-empty-state [filtered]="true" (clearFilters)="clearFilters()">
                    <p>{{ t('packageBumps.empty') }}</p>
                  </chaotic-empty-state>
                } @else {
                  <chaotic-empty-state [hint]="t('packageBumps.firstRun.hint')">
                    <p>{{ t('packageBumps.firstRun.message') }}</p>
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
export class AdminPackageBumpsPageComponent {
  readonly service = inject(AdminService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly transloco = inject(TranslocoService);
  private readonly activeTranslation = injectActiveTranslation();
  protected readonly rowHeights = TABLE_ROW_HEIGHTS;
  protected readonly missingValue = MISSING_VALUE;

  protected readonly filtersActive = computed(
    () =>
      this.service.packageBumpQuery() !== '' ||
      this.service.packageBumpTypeFilter() !== undefined ||
      this.service.packageBumpSourceFilter() !== undefined,
  );

  readonly pagination = createAdminPagination({ router: this.router, route: this.route });

  readonly bumpTypeOptions = computed(() => {
    this.activeTranslation();

    return BUMP_TYPES.map((bumpType) => ({
      label: this.transloco.translate(bumpType.labelKey),
      value: bumpType.value,
    }));
  });

  private readonly bumpTypeLabels = computed(
    () => new Map(this.bumpTypeOptions().map((option) => [option.value, option.label])),
  );

  readonly sourceOptions = SOURCE_OPTIONS;
  readonly manualBumpType = BUMP_TYPE_MANUAL;

  private readonly syncSearch = createDebounced(QUERY_SYNC_DEBOUNCE_MS, () =>
    patchQueryParams(this.router, this.route, { q: queryToQuery(this.service.packageBumpQuery()) }),
  );

  constructor() {
    this.service.useLists(['packageBumps']);
    this.pagination.restoreFromQuery(this.route);
    this.service.packageBumpPage.set(this.pagination.page());
    this.service.packageBumpPerPage.set(this.pagination.perPage());
    restoreQueryParams(this.route, {
      q: (raw) => this.service.packageBumpQuery.set(queryFromRaw(raw)),
      bumpType: (raw) => this.service.packageBumpTypeFilter.set(raw === null ? undefined : Number(raw)),
      source: (raw) => this.service.packageBumpSourceFilter.set(raw === null ? undefined : Number(raw)),
    });
  }

  bumpTypeLabel(bumpType: number): string {
    return this.bumpTypeLabels().get(bumpType) ?? String(bumpType);
  }

  sourceLabel(triggerFrom: number): string {
    return SOURCE_LABELS[triggerFrom] ?? String(triggerFrom);
  }

  sourceSeverity(triggerFrom: number): TagSeverity {
    return triggerFrom === 0 ? 'info' : 'secondary';
  }

  triggerLink(triggerFrom: number): string[] {
    return triggerFrom === 0 ? ['/admin/arch'] : ['/admin/packages'];
  }

  detailsText(bump: PackageBump): string {
    const details = bump.details ?? [];
    if (details.length === 0) return MISSING_VALUE;
    return details.join('; ');
  }

  setBumpTypeFilter(value: number | null | undefined): void {
    this.service.packageBumpTypeFilter.set(value ?? undefined);
    this.resetToFirstPage();
    patchQueryParams(this.router, this.route, {
      bumpType: value === null || value === undefined ? null : String(value),
    });
  }

  setSourceFilter(value: number | null | undefined): void {
    this.service.packageBumpSourceFilter.set(value ?? undefined);
    this.resetToFirstPage();
    patchQueryParams(this.router, this.route, { source: value === null || value === undefined ? null : String(value) });
  }

  onLazyLoad(table: StatefulTableRef, event: { first?: number; rows?: number | null }): void {
    this.pagination.handleStatefulLazyLoad(table, event);
    this.service.packageBumpPage.set(this.pagination.page());
    this.service.packageBumpPerPage.set(this.pagination.perPage());
  }

  onSearch(event: Event): void {
    this.service.packageBumpQuery.set((event.target as HTMLInputElement).value);
    this.resetToFirstPage();
    this.syncSearch();
  }

  clearFilters(): void {
    this.service.packageBumpQuery.set('');
    this.service.packageBumpTypeFilter.set(undefined);
    this.service.packageBumpSourceFilter.set(undefined);
    this.resetToFirstPage();
    patchQueryParams(this.router, this.route, { q: null, bumpType: null, source: null });
  }

  private resetToFirstPage(): void {
    this.pagination.resetPage();
    this.service.packageBumpPage.set(this.pagination.page());
  }
}
