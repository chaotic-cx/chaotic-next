import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { ConfirmationService } from '@openng/optimus-ui/api';
import { Button } from '@openng/optimus-ui/button';
import { TableModule } from '@openng/optimus-ui/table';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { EmptyStateComponent } from '../../empty-state/empty-state.component';
import { LoadErrorComponent } from '../../load-error/load-error.component';
import { MISSING_VALUE } from '../../table-columns/missing-value';
import { TablePageReportDirective } from '../../table-page-report.directive';
import { AdminService } from '../admin.service';
import { AdminOperationListComponent } from './admin-operation-list.component';
import { createAdminPagination, type StatefulTableRef } from '../admin-url-sync';
import { TABLE_ROW_HEIGHTS } from '../../table-skeleton/table-row-heights';
import { TableSkeletonRowsComponent } from '../../table-skeleton/table-skeleton-rows.component';

@Component({
  selector: 'chaotic-admin-repo-operations-page',
  imports: [
    TableSkeletonRowsComponent,
    AdminOperationListComponent,
    Button,
    EmptyStateComponent,
    LoadErrorComponent,
    TableModule,
    TablePageReportDirective,
    Tooltip,
    TranslocoDirective,
  ],
  template: `
    <div class="flex flex-col gap-5" *transloco="let t">
      <chaotic-admin-operation-list />

      <div class="min-w-0">
        <div class="mb-2 flex flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <span class="p-panel-title block text-ctp-text">{{ t('admin.repoOperations.brokenPackages') }}</span>
          <div class="flex flex-wrap items-center gap-3">
            @if (service.brokenSelection().length === 0) {
              <span class="text-[0.8125rem] text-ctp-overlay1" id="broken-selection-hint">{{
                t('admin.repoOperations.selectionHint')
              }}</span>
            }
            <p-button
              [disabled]="service.brokenSelection().length === 0"
              [badge]="service.brokenSelection().length.toString()"
              [label]="t('admin.repoOperations.rescanSelected.label')"
              [pTooltip]="t('admin.repoOperations.rescanSelected.tooltip')"
              (onClick)="confirmRescan()"
              icon="pi pi-microchip"
              size="small"
              severity="secondary"
              tooltipPosition="left"
            />
            <p-button
              [disabled]="service.brokenSelection().length === 0"
              [badge]="service.brokenSelection().length.toString()"
              [label]="t('admin.repoOperations.bumpSelected.label')"
              [pTooltip]="t('admin.repoOperations.bumpSelected.tooltip')"
              (onClick)="confirmBump()"
              icon="pi pi-arrow-up"
              size="small"
              severity="danger"
              tooltipPosition="left"
            />
          </div>
        </div>
        <div class="overflow-x-auto">
          <p-table
            class="chaotic-stack"
            #brokenTable
            [(selection)]="service.brokenSelection"
            [value]="service.brokenReports()"
            [rows]="pagination.perPage()"
            [paginator]="true"
            [lazy]="true"
            [totalRecords]="service.brokenReportsTotal()"
            [chaoticTableFailed]="service.brokenReportsStatus.failed()"
            [scrollable]="true"
            [rowsPerPageOptions]="[25, 50, 100]"
            [selectionMode]="'multiple'"
            [selectionPageOnly]="true"
            (onLazyLoad)="onLazyLoad(brokenTable, $event)"
            (onStateRestore)="clearRestoredSelection()"
            dataKey="pkgname"
            stateStorage="local"
            stateKey="admin-repo-operations-table"
            paginatorDropdownAppendTo="body"
            chaoticPageReport
          >
            <ng-template #header>
              <tr>
                <th style="width: 3rem"><p-tableHeaderCheckbox /></th>
                <th style="min-width: 12rem">{{ t('admin.pages.columns.package') }}</th>
                <th style="min-width: 8rem">{{ t('admin.pages.columns.version') }}</th>
                <th style="min-width: 8rem">{{ t('admin.pages.columns.repo') }}</th>
                <th style="min-width: 16rem">{{ t('admin.repoOperations.columns.reasons') }}</th>
              </tr>
            </ng-template>
            <ng-template pTemplate="body" let-report>
              <tr [pSelectableRow]="report">
                <td class="stack-meta"><p-tableCheckbox [value]="report" /></td>
                <td class="stack-title">
                  <span class="block max-w-xs truncate" [title]="report.pkgname">{{ report.pkgname }}</span>
                </td>
                <td class="stack-sub">{{ report.version || missingValue }}</td>
                <td class="stack-meta" [attr.data-label]="t('admin.pages.columns.repo')">
                  {{ report.repoName || missingValue }}
                </td>
                <td class="text-ctp-subtext stack-body">
                  <span class="line-clamp-2" [title]="report.reasons.join(', ')">{{
                    report.reasons.join(', ') || missingValue
                  }}</span>
                </td>
              </tr>
            </ng-template>
            <ng-template #emptymessage>
              @if (service.brokenReportsLoading()) {
                <chaotic-table-skeleton-rows
                  [rowHeight]="rowHeights.adminBrokenReports"
                  [rows]="pagination.perPage()"
                  [columns]="5"
                />
              } @else {
                <tr>
                  <td [attr.colspan]="5">
                    @if (service.brokenReportsStatus.failed()) {
                      <chaotic-load-error
                        [message]="t('admin.repoOperations.loadError')"
                        [error]="service.brokenReportsStatus.error()"
                        (retry)="service.brokenReportsStatus.reload()"
                      />
                    } @else {
                      <chaotic-empty-state>
                        <p class="inline-flex items-center gap-2">
                          <i class="pi pi-check-circle text-ctp-green" aria-hidden="true"></i>
                          {{ t('admin.repoOperations.empty') }}
                        </p>
                      </chaotic-empty-state>
                    }
                  </td>
                </tr>
              }
            </ng-template>
          </p-table>
        </div>
      </div>
    </div>
  `,
})
export class AdminRepoOperationsPageComponent {
  readonly service = inject(AdminService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly transloco = inject(TranslocoService);
  protected readonly rowHeights = TABLE_ROW_HEIGHTS;
  protected readonly missingValue = MISSING_VALUE;

  readonly pagination = createAdminPagination({ router: this.router, route: this.route });

  constructor() {
    this.service.useLists(['brokenReports']);
    this.pagination.restoreFromQuery(this.route);
    this.service.brokenPage.set(this.pagination.page());
    this.service.brokenPerPage.set(this.pagination.perPage());
  }

  confirmBump(): void {
    const count = this.service.brokenSelection().length;
    if (count === 0) return;

    this.confirmationService.confirm({
      message: this.transloco.translate('admin.repoOperations.bumpConfirm.message', { count }),
      header: this.transloco.translate('admin.repoOperations.bumpConfirm.header'),
      acceptLabel: this.transloco.translate('admin.repoOperations.bumpConfirm.accept'),
      rejectLabel: this.transloco.translate('common.cancel'),
      accept: () => void this.service.bumpBrokenPackages(),
    });
  }

  confirmRescan(): void {
    const count = this.service.brokenSelection().length;
    if (count === 0) return;

    this.confirmationService.confirm({
      message: this.transloco.translate('admin.repoOperations.rescanConfirm.message', { count }),
      header: this.transloco.translate('admin.repoOperations.rescanConfirm.header'),
      acceptLabel: this.transloco.translate('admin.repoOperations.rescanConfirm.accept'),
      rejectLabel: this.transloco.translate('common.cancel'),
      accept: () => void this.service.rescanBrokenPackages(),
    });
  }

  onLazyLoad(table: StatefulTableRef, event: { first?: number; rows?: number | null }): void {
    this.pagination.handleStatefulLazyLoad(table, event);
    this.service.brokenPage.set(this.pagination.page());
    this.service.brokenPerPage.set(this.pagination.perPage());
  }

  /**
   * Restored selections reference stale report objects. The table re-emits the
   * restored selection in a microtask; clear it right after that settles.
   */
  protected clearRestoredSelection(): void {
    queueMicrotask(() => this.service.brokenSelection.set([]));
  }
}
