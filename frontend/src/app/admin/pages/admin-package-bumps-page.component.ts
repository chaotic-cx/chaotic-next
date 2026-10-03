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
  patchQueryParams,
  queryFromRaw,
  queryToQuery,
  restoreQueryParams,
} from '../admin-url-sync';
import { AdminService } from '../admin.service';
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
    DatePipe,
    FormsModule,
    IconField,
    InputIcon,
    InputText,
    Select,
    TableModule,
    TagModule,
    RouterLink,
    TranslocoDirective,
  ],
  template: `
    <div class="table-container" *transloco="let t; prefix: 'admin'">
      <p-table
        #bumpsTable
        [value]="service.packageBumps()?.items ?? []"
        [rows]="pagination.perPage()"
        [paginator]="true"
        [lazy]="true"
        [totalRecords]="service.packageBumpsTotal()"
        [showCurrentPageReport]="true"
        [rowsPerPageOptions]="[25, 50, 100]"
        (onLazyLoad)="onLazyLoad(bumpsTable, $event)"
        dataKey="id"
        stateStorage="local"
        stateKey="admin-bumps-table"
        paginatorDropdownAppendTo="body"
      >
        <ng-template #caption>
          <div class="flex flex-col gap-2.5 sm:flex-row sm:flex-nowrap sm:items-center">
            <div class="hidden sm:ml-auto sm:flex sm:flex-wrap sm:items-center sm:gap-2.5">
              <p-select
                [options]="bumpTypeOptions()"
                [ngModel]="service.packageBumpTypeFilter()"
                [placeholder]="t('packageBumps.columns.bumpType')"
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
                (ngModelChange)="setSourceFilter($event)"
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
                [value]="service.packageBumpQuery()"
                [placeholder]="t('pages.searchPkgname')"
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
            <td>{{ bump.id }}</td>
            <td>
              @if (bump.pkgname) {
                <a
                  class="cursor-pointer text-ctp-mauve hover:underline"
                  [queryParams]="{ q: bump.pkgname }"
                  routerLink="/admin/packages"
                >
                  {{ bump.pkgname }}
                </a>
              }
            </td>
            <td>
              <p-tag [value]="bumpTypeLabel(bump.bumpType)" severity="secondary" />
            </td>
            <td>
              @if (bump.triggerName) {
                <a
                  class="cursor-pointer text-ctp-mauve hover:underline"
                  [routerLink]="triggerLink(bump.triggerFrom)"
                  [queryParams]="{ q: bump.triggerName }"
                >
                  {{ bump.triggerName }}
                </a>
              }
            </td>
            <td>
              @if (bump.bumpType === manualBumpType) {
                <p-tag [value]="t('packageBumps.bumpTypes.manual')" severity="success" />
              } @else {
                <p-tag [value]="sourceLabel(bump.triggerFrom)" [severity]="sourceSeverity(bump.triggerFrom)" />
              }
            </td>
            <td class="text-ctp-subtext">{{ detailsText(bump) }}</td>
            <td>{{ bump.timestamp | date: 'short' }}</td>
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
                <p class="chaotic-card__empty">{{ t('packageBumps.empty') }}</p>
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

  private readonly syncSearch = createDebounced(400, () =>
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
    if (details.length === 0) return '—';
    return details.join('; ');
  }

  setBumpTypeFilter(value: number | null | undefined): void {
    this.service.packageBumpTypeFilter.set(value ?? undefined);
    this.pagination.resetPage();
    patchQueryParams(this.router, this.route, {
      bumpType: value === null || value === undefined ? null : String(value),
    });
  }

  setSourceFilter(value: number | null | undefined): void {
    this.service.packageBumpSourceFilter.set(value ?? undefined);
    this.pagination.resetPage();
    patchQueryParams(this.router, this.route, { source: value === null || value === undefined ? null : String(value) });
  }

  onLazyLoad(table: StatefulTableRef, event: { first?: number; rows?: number | null }): void {
    this.pagination.handleStatefulLazyLoad(table, event);
    this.service.packageBumpPage.set(this.pagination.page());
    this.service.packageBumpPerPage.set(event.rows ?? 25);
  }

  onSearch(event: Event): void {
    this.service.packageBumpQuery.set((event.target as HTMLInputElement).value);
    this.pagination.resetPage();
    this.syncSearch();
  }
}
