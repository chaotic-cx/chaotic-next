import { Component, inject } from '@angular/core';
import { Button } from '@openng/optimus-ui/button';
import { Panel } from '@openng/optimus-ui/panel';
import { TableModule } from '@openng/optimus-ui/table';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { ConfirmationService } from '@openng/optimus-ui/api';
import { ActivatedRoute, Router } from '@angular/router';
import { AdminService } from '../admin.service';
import { createAdminPagination } from '../admin-url-sync';

@Component({
  selector: 'chaotic-admin-repo-operations-page',
  imports: [Button, Panel, TableModule, Tooltip],
  template: `
    <div class="flex flex-col gap-5">
      <p-panel class="min-w-0" header="Trigger operations">
        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-3">
            <p-button
              (onClick)="service.triggerRepoRun()"
              label="Trigger repo run"
              icon="pi pi-play"
              size="small"
              styleClass="w-full sm:w-auto"
              pTooltip="Run the repo manager over the configured repositories"
              tooltipPosition="bottom"
            />
            <p-button
              (onClick)="service.triggerSignalScan()"
              label="Trigger signal scan"
              icon="pi pi-microchip"
              severity="secondary"
              size="small"
              styleClass="w-full sm:w-auto"
              pTooltip="Scan changed Arch packages for ELF signals"
              tooltipPosition="bottom"
            />
            <p-button
              (onClick)="service.triggerMrScan()"
              label="Trigger MR scan"
              icon="pi pi-shield"
              severity="secondary"
              size="small"
              styleClass="w-full sm:w-auto"
              pTooltip="Scan open merge requests for malicious changes: rule findings, auto-flag labels and VirusTotal checks"
              tooltipPosition="bottom"
            />
            <p-button
              (onClick)="service.indexArchMirror()"
              label="Index Arch mirror"
              icon="pi pi-database"
              severity="secondary"
              size="small"
              styleClass="w-full sm:w-auto"
              pTooltip="Index the full Arch mirror into the ELF signal index"
              tooltipPosition="bottom"
            />
            <p-button
              (onClick)="service.indexChaoticRepo()"
              label="Index Chaotic repo"
              icon="pi pi-database"
              severity="secondary"
              size="small"
              styleClass="w-full sm:w-auto"
              pTooltip="Index the full Chaotic-AUR repo (CDN mirror) into the ELF signal index"
              tooltipPosition="bottom"
            />
          </div>
        </div>
      </p-panel>

      <div class="min-w-0">
        <div class="mb-2 flex items-center justify-between gap-3 px-4">
          <span class="p-panel-title block text-ctp-text">Broken packages</span>
          <div class="flex flex-wrap items-center gap-2">
            <p-button
              [disabled]="service.brokenSelection().length === 0"
              [badge]="service.brokenSelection().length.toString()"
              (onClick)="confirmRescan()"
              label="Rescan selected"
              icon="pi pi-microchip"
              size="small"
              severity="secondary"
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
              pTooltip="Rebuild the selected broken packages and commit the changes"
              tooltipPosition="left"
            />
          </div>
        </div>
        <div class="overflow-x-auto">
          <p-table
            [(selection)]="service.brokenSelection"
            [value]="service.brokenReports()"
            [rows]="pagination.perPage()"
            [loading]="service.brokenReportsLoading()"
            [paginator]="true"
            [lazy]="true"
            [totalRecords]="service.brokenReportsTotal()"
            [showCurrentPageReport]="true"
            [scrollable]="true"
            [rowsPerPageOptions]="[25, 50, 100]"
            [selectionMode]="'multiple'"
            [selectionPageOnly]="true"
            (onLazyLoad)="onLazyLoad($event)"
            dataKey="pkgname"
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
            <ng-template #empty>
              <span class="text-ctp-subtext">No broken packages found.</span>
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

  readonly pagination = createAdminPagination({ router: this.router, route: this.route });

  constructor() {
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

  onLazyLoad(event: { first?: number; rows?: number | null }): void {
    this.pagination.handleLazyLoad(event);
    this.service.brokenPage.set(this.pagination.page());
    this.service.brokenPerPage.set(event.rows ?? 25);
  }
}
