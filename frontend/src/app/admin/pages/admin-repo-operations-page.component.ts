import { Component, inject } from '@angular/core';
import { Button } from '@openng/optimus-ui/button';
import { TableModule } from '@openng/optimus-ui/table';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { ConfirmationService } from '@openng/optimus-ui/api';
import { ActivatedRoute, Router } from '@angular/router';
import { AdminService } from '../admin.service';
import { AdminOperationListComponent } from './admin-operation-list.component';
import { createAdminPagination, type StatefulTableRef } from '../admin-url-sync';
import { TABLE_ROW_HEIGHTS } from '../../table-skeleton/table-row-heights';
import { TableSkeletonRowsComponent } from '../../table-skeleton/table-skeleton-rows.component';

@Component({
  selector: 'chaotic-admin-repo-operations-page',
  imports: [TableSkeletonRowsComponent, AdminOperationListComponent, Button, TableModule, Tooltip],
  template: `
    <div class="flex flex-col gap-5">
      <chaotic-admin-operation-list />

      <div class="min-w-0">
        <div class="mb-2 flex flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <span class="p-panel-title block text-ctp-text">Broken packages</span>
          <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            <p-button
              [disabled]="service.brokenSelection().length === 0"
              [badge]="service.brokenSelection().length.toString()"
              (onClick)="confirmRescan()"
              label="Rescan selected"
              icon="pi pi-microchip"
              size="small"
              severity="secondary"
              styleClass="w-full sm:w-auto"
              pTooltip="Re-run the ELF signal analysis for the selected broken packages; may take a while"
              tooltipPosition="left"
            />
            <p-button
              [disabled]="service.brokenSelection().length === 0"
              [badge]="service.brokenSelection().length.toString()"
              (onClick)="confirmBump()"
              label="Bump selected"
              icon="pi pi-arrow-up"
              size="small"
              severity="danger"
              styleClass="w-full sm:w-auto"
              pTooltip="Rebuild the selected broken packages and commit the changes"
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
                <th style="min-width: 12rem">Package</th>
                <th style="min-width: 8rem">Version</th>
                <th style="min-width: 8rem">Repo</th>
                <th style="min-width: 16rem">Reasons</th>
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
                  <td [attr.colspan]="5"><p class="chaotic-card__empty">No broken packages found.</p></td>
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
      message: `Rebuild ${count} selected broken package(s)? This bumps their pkgrel and commits the changes.`,
      header: 'Bump selected packages',
      acceptLabel: 'Bump',
      rejectLabel: 'Cancel',
      accept: () => void this.service.bumpBrokenPackages(),
    });
  }

  confirmRescan(): void {
    const count = this.service.brokenSelection().length;
    if (count === 0) return;
    this.confirmationService.confirm({
      message:
        `Re-run the ELF signal analysis for ${count} selected package(s)? ` +
        'Each archive is downloaded and scanned in the background, so results are not immediate.',
      header: 'Rescan selected packages',
      acceptLabel: 'Rescan',
      rejectLabel: 'Cancel',
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
