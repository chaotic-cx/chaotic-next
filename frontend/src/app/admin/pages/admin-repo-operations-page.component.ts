import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { ConfirmationService } from '@openng/optimus-ui/api';
import { Button } from '@openng/optimus-ui/button';
import { TableModule } from '@openng/optimus-ui/table';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { AdminService } from '../admin.service';
import { AdminOperationListComponent } from './admin-operation-list.component';
import { createAdminPagination, type StatefulTableRef } from '../admin-url-sync';
import { TABLE_ROW_HEIGHTS } from '../../table-skeleton/table-row-heights';
import { TableSkeletonRowsComponent } from '../../table-skeleton/table-skeleton-rows.component';

@Component({
  selector: 'chaotic-admin-repo-operations-page',
  imports: [TableSkeletonRowsComponent, AdminOperationListComponent, Button, TableModule, Tooltip, TranslocoDirective],
  template: `
    <div class="flex flex-col gap-5" *transloco="let t">
      <chaotic-admin-operation-list />

      <div class="min-w-0">
        <div class="mb-2 flex flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <span class="p-panel-title block text-ctp-text">{{ t('admin.repoOperations.brokenPackages') }}</span>
          <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            <p-button
              [disabled]="service.brokenSelection().length === 0"
              [badge]="service.brokenSelection().length.toString()"
              [label]="t('admin.repoOperations.rescanSelected.label')"
              [pTooltip]="t('admin.repoOperations.rescanSelected.tooltip')"
              (onClick)="confirmRescan()"
              icon="pi pi-microchip"
              size="small"
              severity="secondary"
              styleClass="w-full sm:w-auto"
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
              styleClass="w-full sm:w-auto"
              tooltipPosition="left"
            />
          </div>
        </div>
        <div class="overflow-x-auto">
          <p-table
            #brokenTable
            [(selection)]="service.brokenSelection"
            [value]="service.brokenReports()"
            [rows]="pagination.perPage()"
            [paginator]="true"
            [lazy]="true"
            [totalRecords]="service.brokenReportsTotal()"
            [showCurrentPageReport]="true"
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
                <td><p-tableCheckbox [value]="report" /></td>
                <td>{{ report.pkgname }}</td>
                <td>{{ report.version }}</td>
                <td>{{ report.repoName }}</td>
                <td class="text-ctp-subtext">{{ report.reasons.join(', ') }}</td>
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
                    <p class="chaotic-card__empty">{{ t('admin.repoOperations.empty') }}</p>
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
    this.service.brokenPerPage.set(event.rows ?? 25);
  }

  /**
   * Restored selections reference stale report objects. The table re-emits the
   * restored selection in a microtask; clear it right after that settles.
   */
  protected clearRestoredSelection(): void {
    queueMicrotask(() => this.service.brokenSelection.set([]));
  }
}
