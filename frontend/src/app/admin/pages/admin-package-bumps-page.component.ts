import { Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PackageBump } from '@chaotic-next/shared-lib';
import { IconField } from '@openng/optimus-ui/iconfield';
import { InputIcon } from '@openng/optimus-ui/inputicon';
import { InputText } from '@openng/optimus-ui/inputtext';
import { Select } from '@openng/optimus-ui/select';
import { TableModule } from '@openng/optimus-ui/table';
import { TagModule } from '@openng/optimus-ui/tag';
import { ActivatedRoute, Router } from '@angular/router';
import { AdminService } from '../admin.service';
import {
  createDebounced,
  pageFromQuery,
  pageToQuery,
  patchQueryParams,
  queryFromRaw,
  queryToQuery,
  restoreQueryParams,
} from '../admin-url-sync';

const BUMP_TYPE_OPTIONS = [
  { label: 'Explicit', value: 0 },
  { label: 'Global', value: 1 },
  { label: 'From deps', value: 2 },
  { label: 'From deps (chaotic)', value: 3 },
  { label: 'Plugin', value: 6 },
  { label: 'Broken deps', value: 7 },
];

const BUMP_TYPE_LABELS: Record<number, string> = Object.fromEntries(
  BUMP_TYPE_OPTIONS.map((option) => [option.value, option.label]),
);

const SOURCE_OPTIONS = [
  { label: 'Arch', value: 0 },
  { label: 'Chaotic', value: 1 },
];

const SOURCE_LABELS: Record<number, string> = {
  0: 'arch',
  1: 'chaotic',
};

type TagSeverity = 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast' | null | undefined;

@Component({
  selector: 'chaotic-admin-package-bumps-page',
  imports: [DatePipe, FormsModule, IconField, InputIcon, InputText, Select, TableModule, TagModule, RouterLink],
  template: `
    <div class="table-container">
      <p-table
        [value]="service.packageBumps()?.items ?? []"
        [rows]="25"
        [loading]="service.packageBumpsLoading()"
        [paginator]="true"
        [lazy]="true"
        [totalRecords]="service.packageBumpsTotal()"
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
                [options]="bumpTypeOptions"
                [ngModel]="service.packageBumpTypeFilter()"
                (ngModelChange)="setBumpTypeFilter($event)"
                optionLabel="label"
                optionValue="value"
                placeholder="Bump type"
                showClear
                appendTo="body"
              />
              <p-select
                [options]="sourceOptions"
                [ngModel]="service.packageBumpSourceFilter()"
                (ngModelChange)="setSourceFilter($event)"
                optionLabel="label"
                optionValue="value"
                placeholder="Source"
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
                (input)="onSearch($event)"
                pInputText
                type="text"
                placeholder="Search pkgname"
              />
            </p-iconfield>
          </div>
        </ng-template>
        <ng-template #header>
          <tr>
            <th style="min-width: 3rem">ID</th>
            <th style="min-width: 12rem">Package</th>
            <th style="min-width: 10rem">Bump type</th>
            <th style="min-width: 12rem">Trigger</th>
            <th style="min-width: 8rem">Triggered by</th>
            <th style="min-width: 14rem">Details</th>
            <th style="min-width: 9rem">Timestamp</th>
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
              <p-tag [value]="sourceLabel(bump.triggerFrom)" [severity]="sourceSeverity(bump.triggerFrom)" />
            </td>
            <td class="text-ctp-subtext">{{ detailsText(bump) }}</td>
            <td>{{ bump.timestamp | date: 'short' }}</td>
          </tr>
        </ng-template>
      </p-table>
    </div>
  `,
})
export class AdminPackageBumpsPageComponent {
  readonly service = inject(AdminService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly bumpTypeOptions = BUMP_TYPE_OPTIONS;
  readonly sourceOptions = SOURCE_OPTIONS;

  private readonly syncSearch = createDebounced(400, () =>
    patchQueryParams(this.router, this.route, { q: queryToQuery(this.service.packageBumpQuery()) }),
  );

  constructor() {
    restoreQueryParams(this.route, {
      q: (raw) => this.service.packageBumpQuery.set(queryFromRaw(raw)),
      bumpType: (raw) => this.service.packageBumpTypeFilter.set(raw === null ? undefined : Number(raw)),
      source: (raw) => this.service.packageBumpSourceFilter.set(raw === null ? undefined : Number(raw)),
      page: (raw) => this.service.packageBumpPage.set(pageFromQuery(raw)),
    });
  }

  bumpTypeLabel(bumpType: number): string {
    return BUMP_TYPE_LABELS[bumpType] ?? String(bumpType);
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
    this.service.packageBumpPage.set(1);
    patchQueryParams(this.router, this.route, {
      bumpType: value === null || value === undefined ? null : String(value),
    });
  }

  setSourceFilter(value: number | null | undefined): void {
    this.service.packageBumpSourceFilter.set(value ?? undefined);
    this.service.packageBumpPage.set(1);
    patchQueryParams(this.router, this.route, { source: value === null || value === undefined ? null : String(value) });
  }

  onLazyLoad(event: { first?: number; rows?: number | null }): void {
    const page = Math.floor((event.first ?? 0) / (event.rows ?? 25)) + 1;
    this.service.packageBumpPage.set(page);
    patchQueryParams(this.router, this.route, { page: pageToQuery(page) });
  }

  onSearch(event: Event): void {
    this.service.packageBumpQuery.set((event.target as HTMLInputElement).value);
    this.service.packageBumpPage.set(1);
    this.syncSearch();
  }
}
