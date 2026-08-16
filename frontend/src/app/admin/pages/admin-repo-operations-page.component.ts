import { Component, inject } from '@angular/core';
import { Button } from '@openng/optimus-ui/button';
import { Panel } from '@openng/optimus-ui/panel';
import { TableModule } from '@openng/optimus-ui/table';
import { Tooltip } from '@openng/optimus-ui/tooltip';
import { AdminService } from '../admin.service';

@Component({
  selector: 'chaotic-admin-repo-operations-page',
  imports: [Button, Panel, TableModule, Tooltip],
  template: `
    <div class="flex flex-col gap-5">
      <p-panel header="Trigger operations">
        <div class="flex flex-col gap-4">
          <div class="flex flex-wrap gap-3">
            <p-button
              (onClick)="service.triggerRepoRun()"
              label="Trigger repo run"
              icon="pi pi-play"
              pTooltip="Run the repo manager over the configured repositories"
              tooltipPosition="bottom"
            />
            <p-button
              (onClick)="service.triggerSignalScan()"
              label="Trigger signal scan"
              icon="pi pi-microchip"
              severity="secondary"
              pTooltip="Scan changed Arch packages for ELF signals"
              tooltipPosition="bottom"
            />
            <p-button
              (onClick)="service.triggerMrScan()"
              label="Trigger MR scan"
              icon="pi pi-shield"
              severity="secondary"
              pTooltip="Scan open merge requests for malicious changes: rule findings, auto-flag labels and VirusTotal checks"
              tooltipPosition="bottom"
            />
            <p-button
              (onClick)="service.indexArchMirror()"
              label="Index Arch mirror"
              icon="pi pi-database"
              severity="secondary"
              pTooltip="Index the full Arch mirror into the ELF signal index"
              tooltipPosition="bottom"
            />
            <p-button
              (onClick)="service.indexChaoticRepo()"
              label="Index Chaotic repo"
              icon="pi pi-database"
              severity="secondary"
              pTooltip="Index the full Chaotic-AUR repo (CDN mirror) into the ELF signal index"
              tooltipPosition="bottom"
            />
          </div>
        </div>
      </p-panel>

      <p-panel header="Broken packages">
        <div class="overflow-x-auto">
          <p-table
            [value]="service.brokenReports()"
            [rows]="25"
            [loading]="service.brokenReportsLoading()"
            [paginator]="true"
            [lazy]="true"
            [totalRecords]="service.brokenReportsTotal()"
            [showCurrentPageReport]="true"
            [rowsPerPageOptions]="[25, 50, 100]"
            (onLazyLoad)="onLazyLoad($event)"
            dataKey="pkgname"
            paginatorDropdownAppendTo="body"
          >
            <ng-template #header>
              <tr>
                <th style="min-width: 12rem">Package</th>
                <th style="min-width: 8rem">Version</th>
                <th style="min-width: 8rem">Repo</th>
                <th style="min-width: 16rem">Reasons</th>
              </tr>
            </ng-template>
            <ng-template pTemplate="body" let-report>
              <tr>
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
      </p-panel>
    </div>
  `,
})
export class AdminRepoOperationsPageComponent {
  readonly service = inject(AdminService);

  onLazyLoad(event: { first?: number; rows?: number | null }): void {
    this.service.brokenPage.set(Math.floor((event.first ?? 0) / (event.rows ?? 25)) + 1);
  }
}
