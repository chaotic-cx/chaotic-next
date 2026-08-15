import { Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PIPELINE_OPERATIONS, PipelineTriggerAction } from '@chaotic-next/shared-lib';
import { IconField } from '@openng/optimus-ui/iconfield';
import { InputIcon } from '@openng/optimus-ui/inputicon';
import { InputText } from '@openng/optimus-ui/inputtext';
import { Select } from '@openng/optimus-ui/select';
import { TableModule } from '@openng/optimus-ui/table';
import { TagModule } from '@openng/optimus-ui/tag';
import { AdminService } from '../admin.service';

const OPERATION_OPTIONS = PIPELINE_OPERATIONS.map((operation) => ({ label: operation, value: operation }));

@Component({
  selector: 'chaotic-admin-pipeline-triggers-page',
  imports: [DatePipe, FormsModule, IconField, InputIcon, InputText, Select, TableModule, TagModule],
  template: `
    <div class="table-container">
      <p-table
        [value]="service.pipelineTriggers()?.items ?? []"
        [rows]="25"
        [loading]="service.pipelineTriggersLoading()"
        [paginator]="true"
        [lazy]="true"
        [totalRecords]="service.pipelineTriggersTotal()"
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
                [options]="operationOptions"
                [ngModel]="service.pipelineTriggerOperationFilter()"
                (ngModelChange)="setOperationFilter($event)"
                optionLabel="label"
                optionValue="value"
                placeholder="Operation"
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
                [value]="service.pipelineTriggerQuery()"
                (input)="onSearch($event)"
                pInputText
                type="text"
                placeholder="Search pipeline, user"
              />
            </p-iconfield>
          </div>
        </ng-template>
        <ng-template #header>
          <tr>
            <th style="min-width: 3rem">ID</th>
            <th style="min-width: 8rem">Pipeline</th>
            <th style="min-width: 10rem">Operation</th>
            <th style="min-width: 16rem">Inputs</th>
            <th style="min-width: 8rem">Ref</th>
            <th style="min-width: 10rem">User</th>
            <th style="min-width: 8rem">Created</th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-trigger>
          <tr>
            <td>{{ trigger.id }}</td>
            <td>
              @if (trigger.webUrl) {
                <a
                  class="cursor-pointer text-ctp-mauve hover:underline"
                  [href]="trigger.webUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  #{{ trigger.pipelineId }}
                </a>
              } @else {
                <span class="text-ctp-subtext0">none</span>
              }
            </td>
            <td>
              <p-tag [value]="trigger.operation" [severity]="trigger.operation === 'None' ? 'secondary' : 'info'" />
            </td>
            <td>
              <code class="text-sm">{{ formatInputs(trigger) }}</code>
            </td>
            <td>{{ trigger.ref }}</td>
            <td>
              <span class="font-medium">{{ trigger.userName }}</span>
            </td>
            <td>{{ trigger.createdAt | date: 'short' }}</td>
          </tr>
        </ng-template>
      </p-table>
    </div>
  `,
})
export class AdminPipelineTriggersPageComponent {
  readonly service = inject(AdminService);

  readonly operationOptions = OPERATION_OPTIONS;

  formatInputs(trigger: PipelineTriggerAction): string {
    return Object.entries(trigger.inputs)
      .filter(([key]) => key !== 'operation')
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
  }

  onLazyLoad(event: { first?: number; rows?: number | null }): void {
    this.service.pipelineTriggerPage.set(Math.floor((event.first ?? 0) / (event.rows ?? 25)) + 1);
  }

  onSearch(event: Event): void {
    this.service.pipelineTriggerQuery.set((event.target as HTMLInputElement).value);
    this.service.pipelineTriggerPage.set(1);
  }

  setOperationFilter(value: string | null | undefined): void {
    this.service.pipelineTriggerOperationFilter.set(value ?? undefined);
    this.service.pipelineTriggerPage.set(1);
  }
}
