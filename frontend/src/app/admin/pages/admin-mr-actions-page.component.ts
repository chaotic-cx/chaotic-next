import { Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MrAction } from '@chaotic-next/shared-lib';
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
  stringFilterFromQuery,
  stringFilterToQuery,
} from '../admin-url-sync';

const ACTION_SEVERITY: Record<string, TagSeverity> = {
  approve: 'success',
  dangerous: 'danger',
  hold: 'warn',
};

const ACTION_OPTIONS = [
  { label: 'Approve', value: 'approve' },
  { label: 'Dangerous', value: 'dangerous' },
  { label: 'Hold', value: 'hold' },
];

type TagSeverity = 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast' | null | undefined;

@Component({
  selector: 'chaotic-admin-mr-actions-page',
  imports: [DatePipe, FormsModule, IconField, InputIcon, InputText, Select, TableModule, TagModule],
  template: `
    <div class="table-container">
      <p-table
        [value]="service.mrActions()?.items ?? []"
        [rows]="25"
        [loading]="service.mrActionsLoading()"
        [paginator]="true"
        [lazy]="true"
        [totalRecords]="service.mrActionsTotal()"
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
                [options]="actionOptions"
                [ngModel]="service.mrActionActionFilter()"
                (ngModelChange)="setActionFilter($event)"
                optionLabel="label"
                optionValue="value"
                placeholder="Action"
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
                (input)="onSearch($event)"
                pInputText
                type="text"
                placeholder="Search MR, commit, user"
              />
            </p-iconfield>
          </div>
        </ng-template>
        <ng-template #header>
          <tr>
            <th style="min-width: 3rem">ID</th>
            <th style="min-width: 8rem">MR</th>
            <th style="min-width: 8rem">Action</th>
            <th style="min-width: 10rem">Commit</th>
            <th style="min-width: 10rem">User</th>
            <th style="min-width: 8rem">Created</th>
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
              <span class="font-medium">{{ action.userName }}</span>
            </td>
            <td>{{ action.createdAt | date: 'short' }}</td>
          </tr>
        </ng-template>
      </p-table>
    </div>
  `,
})
export class AdminMrActionsPageComponent {
  readonly service = inject(AdminService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly actionOptions = ACTION_OPTIONS;

  private readonly syncSearch = createDebounced(400, () =>
    patchQueryParams(this.router, this.route, { q: queryToQuery(this.service.mrActionQuery()) }),
  );

  constructor() {
    restoreQueryParams(this.route, {
      q: (raw) => this.service.mrActionQuery.set(queryFromRaw(raw)),
      action: (raw) => this.service.mrActionActionFilter.set(stringFilterFromQuery(raw)),
      page: (raw) => this.service.mrActionPage.set(pageFromQuery(raw)),
    });
  }

  private readonly mrBaseUrl = 'https://gitlab.com/chaotic-aur/pkgbuilds/-/merge_requests';
  private readonly commitBaseUrl = 'https://gitlab.com/chaotic-aur/pkgbuilds/-/commit';

  severity(action: MrAction): TagSeverity {
    return ACTION_SEVERITY[action.action] ?? 'secondary';
  }

  shortSha(sha: string): string {
    return sha.slice(0, 8);
  }

  commitUrl(sha: string): string {
    return `${this.commitBaseUrl}/${sha}`;
  }

  mrUrl(iid: number): string {
    return `${this.mrBaseUrl}/${iid}`;
  }

  onLazyLoad(event: { first?: number; rows?: number | null }): void {
    const page = Math.floor((event.first ?? 0) / (event.rows ?? 25)) + 1;
    this.service.mrActionPage.set(page);
    patchQueryParams(this.router, this.route, { page: pageToQuery(page) });
  }

  onSearch(event: Event): void {
    this.service.mrActionQuery.set((event.target as HTMLInputElement).value);
    this.service.mrActionPage.set(1);
    this.syncSearch();
  }

  setActionFilter(value: string | null | undefined): void {
    this.service.mrActionActionFilter.set(value ?? undefined);
    this.service.mrActionPage.set(1);
    patchQueryParams(this.router, this.route, { action: stringFilterToQuery(value ?? undefined) });
  }
}
