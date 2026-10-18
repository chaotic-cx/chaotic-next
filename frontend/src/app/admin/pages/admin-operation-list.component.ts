import { Component, inject, signal } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { ConfirmationService } from '@openng/optimus-ui/api';
import { AdminService } from '../admin.service';

interface OperationConfirmation {
  headerKey: string;
  messageKey: string;
}

interface Operation {
  key: string;
  labelKey: string;
  descriptionKey: string;
  actionLabelKey: string;
  run: () => Promise<void>;
  confirmation?: OperationConfirmation;
}

interface OperationGroup {
  labelKey: string;
  spansTwoRows: boolean;
  operations: Operation[];
}

@Component({
  selector: 'chaotic-admin-operation-list',
  imports: [TranslocoDirective],
  template: `
    <section class="chaotic-card" *transloco="let t" aria-labelledby="operations-title">
      <header class="chaotic-card__header">
        <h2 class="chaotic-card__title" id="operations-title">{{ t('admin.operationList.title') }}</h2>
        <span class="operations-hint" aria-live="polite">
          @if (runningKey() === null) {
            {{ t('admin.operationList.hint') }}
          } @else {
            {{ t('admin.operationList.busyHint') }}
          }
        </span>
      </header>
      <div class="operation-groups">
        @for (group of groups; track group.labelKey) {
          <div
            class="operation-group"
            [class.operation-group--wide]="group.spansTwoRows"
            [attr.aria-label]="t(group.labelKey)"
            role="group"
          >
            <p class="operation-group__label">{{ t(group.labelKey) }}</p>
            <ul class="operation-list">
              @for (operation of group.operations; track operation.key) {
                <li class="operation">
                  <div class="operation__text">
                    <p class="operation__label">{{ t(operation.labelKey) }}</p>
                    <p class="operation__desc">{{ t(operation.descriptionKey) }}</p>
                  </div>
                  <button
                    class="operation__run"
                    [disabled]="runningKey() !== null"
                    [attr.aria-busy]="runningKey() === operation.key"
                    [attr.title]="
                      runningKey() !== null && runningKey() !== operation.key ? t('admin.operationList.busyHint') : null
                    "
                    (click)="start(operation)"
                    type="button"
                  >
                    @if (runningKey() === operation.key) {
                      <i class="pi pi-spin pi-spinner" aria-hidden="true"></i>
                      {{ t('admin.operationList.starting') }}
                    } @else {
                      {{ t(operation.actionLabelKey) }}
                    }
                  </button>
                </li>
              }
            </ul>
          </div>
        }
      </div>
    </section>
  `,
  styles: `
    .operations-hint {
      margin-left: auto;
      font-size: 0.8125rem;
      color: var(--chaotic-fg-faint);
    }

    @media (max-width: 767px) {
      .operations-hint {
        display: none;
      }
    }

    .operation-groups {
      display: grid;
      gap: 0.5rem 2rem;
      padding: 0.5rem 1rem 0.75rem;
    }

    @media (min-width: 1280px) {
      .operation-groups {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .operation-group--wide {
        grid-column: 2;
        grid-row: 1 / span 2;
      }
    }

    .operation-group__label {
      padding-top: 0.75rem;
      font-size: 0.75rem;
      font-weight: var(--chaotic-weight-medium);
      color: var(--chaotic-fg-faint);
    }

    .operation {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding-block: 0.75rem;
      border-bottom: 1px solid var(--chaotic-border);
    }

    .operation:last-child {
      border-bottom: none;
    }

    .operation__text {
      flex: 1;
      min-width: 0;
    }

    .operation__label {
      font-size: 0.875rem;
      font-weight: var(--chaotic-weight-medium);
      color: var(--catppuccin-color-text);
    }

    .operation__desc {
      margin-top: 0.125rem;
      font-size: 0.8125rem;
      line-height: 1.45;
      color: var(--chaotic-fg-muted);
    }

    .operation__run {
      display: inline-flex;
      flex: none;
      align-items: center;
      justify-content: center;
      gap: 0.375rem;
      width: 7rem;
      min-height: 2rem;
      border: 1px solid var(--chaotic-border);
      border-radius: var(--chaotic-radius-sm);
      font-size: 0.8125rem;
      font-weight: var(--chaotic-weight-semibold);
      color: var(--catppuccin-color-text);
      cursor: pointer;
      transition:
        border-color var(--chaotic-duration-fast) var(--chaotic-ease-out),
        color var(--chaotic-duration-fast) var(--chaotic-ease-out),
        background-color var(--chaotic-duration-fast) var(--chaotic-ease-out);
    }

    @media (pointer: coarse) {
      .operation__run {
        min-height: 2.75rem;
      }
    }

    .operation__run:hover:not(:disabled) {
      border-color: var(--catppuccin-color-mauve);
      color: var(--catppuccin-color-mauve);
    }

    .operation__run:active:not(:disabled) {
      background: color-mix(in srgb, var(--catppuccin-color-mauve) 10%, transparent);
    }

    .operation__run:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }

    .operation__run[aria-busy='true'] {
      opacity: 1;
      color: var(--chaotic-fg-muted);
    }

    .operation__run:focus-visible {
      outline: 2px solid var(--catppuccin-color-mauve);
      outline-offset: 2px;
    }
  `,
})
export class AdminOperationListComponent {
  private readonly service = inject(AdminService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly transloco = inject(TranslocoService);

  protected readonly runningKey = signal<string | null>(null);

  protected readonly groups: OperationGroup[] = [
    {
      labelKey: marker('admin.operationList.groups.repoManager'),
      spansTwoRows: false,
      operations: [
        {
          key: 'repo-run',
          labelKey: marker('admin.operationList.repoRun.label'),
          descriptionKey: marker('admin.operationList.repoRun.description'),
          actionLabelKey: marker('admin.operationList.actions.run'),
          run: () => this.service.triggerRepoRun(),
        },
        {
          key: 'build-classes',
          labelKey: marker('admin.operationList.buildClasses.label'),
          descriptionKey: marker('admin.operationList.buildClasses.description'),
          actionLabelKey: marker('admin.operationList.actions.rescan'),
          run: () => this.service.rescanBuildClasses(),
          confirmation: {
            headerKey: marker('admin.operationList.buildClasses.confirmHeader'),
            messageKey: marker('admin.operationList.buildClasses.confirmMessage'),
          },
        },
      ],
    },
    {
      labelKey: marker('admin.operationList.groups.elfSignalIndex'),
      spansTwoRows: true,
      operations: [
        {
          key: 'signal-scan',
          labelKey: marker('admin.operationList.signalScan.label'),
          descriptionKey: marker('admin.operationList.signalScan.description'),
          actionLabelKey: marker('admin.operationList.actions.scan'),
          run: () => this.service.triggerSignalScan(),
        },
        {
          key: 'index-arch',
          labelKey: marker('admin.operationList.indexArch.label'),
          descriptionKey: marker('admin.operationList.indexArch.description'),
          actionLabelKey: marker('admin.operationList.actions.index'),
          run: () => this.service.indexArchMirror(),
        },
        {
          key: 'index-chaotic',
          labelKey: marker('admin.operationList.indexChaotic.label'),
          descriptionKey: marker('admin.operationList.indexChaotic.description'),
          actionLabelKey: marker('admin.operationList.actions.index'),
          run: () => this.service.indexChaoticRepo(),
        },
        {
          key: 'derivations',
          labelKey: marker('admin.operationList.derivations.label'),
          descriptionKey: marker('admin.operationList.derivations.description'),
          actionLabelKey: marker('admin.operationList.actions.recompute'),
          run: () => this.service.recomputeSignalDerivations(),
          confirmation: {
            headerKey: marker('admin.operationList.derivations.confirmHeader'),
            messageKey: marker('admin.operationList.derivations.confirmMessage'),
          },
        },
      ],
    },
    {
      labelKey: marker('admin.operationList.groups.mergeRequests'),
      spansTwoRows: false,
      operations: [
        {
          key: 'mr-scan',
          labelKey: marker('admin.operationList.mrScan.label'),
          descriptionKey: marker('admin.operationList.mrScan.description'),
          actionLabelKey: marker('admin.operationList.actions.scan'),
          run: () => this.service.triggerMrScan(),
        },
      ],
    },
  ];

  protected start(operation: Operation): void {
    if (!operation.confirmation) {
      void this.run(operation);
      return;
    }

    const message = this.transloco.translate(operation.confirmation.messageKey);

    this.confirmationService.confirm({
      header: this.transloco.translate(operation.confirmation.headerKey),
      message: this.transloco.translate('admin.operationList.confirmInBackground', { message }),
      acceptLabel: this.transloco.translate(operation.actionLabelKey),
      rejectLabel: this.transloco.translate('common.cancel'),
      accept: () => void this.run(operation),
    });
  }

  private async run(operation: Operation): Promise<void> {
    this.runningKey.set(operation.key);
    try {
      await operation.run();
    } finally {
      this.runningKey.set(null);
    }
  }
}
