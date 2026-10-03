import { Component, inject, signal } from '@angular/core';
import { ConfirmationService } from '@openng/optimus-ui/api';
import { AdminService } from '../admin.service';

interface OperationConfirmation {
  header: string;
  message: string;
}

interface Operation {
  key: string;
  label: string;
  description: string;
  actionLabel: string;
  run: () => Promise<void>;
  confirmation?: OperationConfirmation;
}

interface OperationGroup {
  label: string;
  spansTwoRows: boolean;
  operations: Operation[];
}

@Component({
  selector: 'chaotic-admin-operation-list',
  template: `
    <section class="chaotic-card" aria-labelledby="operations-title">
      <header class="chaotic-card__header">
        <h2 class="chaotic-card__title" id="operations-title">Operations</h2>
        <span class="operations-hint">Every operation runs in the background. A toast confirms the start.</span>
      </header>
      <div class="operation-groups">
        @for (group of groups; track group.label) {
          <div
            class="operation-group"
            [class.operation-group--wide]="group.spansTwoRows"
            [attr.aria-label]="group.label"
            role="group"
          >
            <p class="operation-group__label">{{ group.label }}</p>
            <ul class="operation-list">
              @for (operation of group.operations; track operation.key) {
                <li class="operation">
                  <div class="operation__text">
                    <p class="operation__label">{{ operation.label }}</p>
                    <p class="operation__desc">{{ operation.description }}</p>
                  </div>
                  <button
                    class="operation__run"
                    [disabled]="runningKey() !== null"
                    [attr.aria-busy]="runningKey() === operation.key"
                    (click)="start(operation)"
                    type="button"
                  >
                    @if (runningKey() === operation.key) {
                      <i class="pi pi-spin pi-spinner" aria-hidden="true"></i>
                      Starting
                    } @else {
                      {{ operation.actionLabel }}
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
      color: var(--ctp-mocha-overlay1);
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
      font-weight: 500;
      color: var(--ctp-mocha-overlay1);
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
      font-weight: 500;
      color: var(--ctp-mocha-text);
    }

    .operation__desc {
      margin-top: 0.125rem;
      font-size: 0.8125rem;
      line-height: 1.45;
      color: var(--ctp-mocha-subtext0);
    }

    .operation__run {
      display: inline-flex;
      flex: none;
      align-items: center;
      justify-content: center;
      gap: 0.375rem;
      width: 7rem;
      height: 2rem;
      border: 1px solid var(--chaotic-border);
      border-radius: var(--chaotic-radius-sm);
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--ctp-mocha-text);
      cursor: pointer;
      transition:
        border-color 120ms ease-out,
        color 120ms ease-out,
        background-color 120ms ease-out;
    }

    .operation__run:hover:not(:disabled) {
      border-color: var(--ctp-mocha-mauve);
      color: var(--ctp-mocha-mauve);
    }

    .operation__run:active:not(:disabled) {
      background: color-mix(in srgb, var(--ctp-mocha-mauve) 10%, transparent);
    }

    .operation__run:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }

    .operation__run[aria-busy='true'] {
      opacity: 1;
      color: var(--ctp-mocha-subtext0);
    }

    .operation__run:focus-visible {
      outline: 2px solid var(--ctp-mocha-mauve);
      outline-offset: 2px;
    }
  `,
})
export class AdminOperationListComponent {
  private readonly service = inject(AdminService);
  private readonly confirmationService = inject(ConfirmationService);

  protected readonly runningKey = signal<string | null>(null);

  protected readonly groups: OperationGroup[] = [
    {
      label: 'Repo manager',
      spansTwoRows: false,
      operations: [
        {
          key: 'repo-run',
          label: 'Repo run',
          description: 'Check Arch for updates and bump the Chaotic packages that depend on them.',
          actionLabel: 'Run',
          run: () => this.service.triggerRepoRun(),
        },
        {
          key: 'build-classes',
          label: 'Build classes',
          description: 'Read the build class of every active package from its .CI/config again.',
          actionLabel: 'Rescan',
          run: () => this.service.rescanBuildClasses(),
          confirmation: {
            header: 'Rescan build classes',
            message: 'Read the build class of every active package from its .CI/config again?',
          },
        },
      ],
    },
    {
      label: 'ELF signal index',
      spansTwoRows: true,
      operations: [
        {
          key: 'signal-scan',
          label: 'Changed Arch packages',
          description: 'Scan the Arch packages that changed since the last scan for ELF signals.',
          actionLabel: 'Scan',
          run: () => this.service.triggerSignalScan(),
        },
        {
          key: 'index-arch',
          label: 'Full Arch mirror',
          description: 'Index every package of the Arch mirror. This takes long.',
          actionLabel: 'Index',
          run: () => this.service.indexArchMirror(),
        },
        {
          key: 'index-chaotic',
          label: 'Full Chaotic repo',
          description: 'Index every Chaotic-AUR package from the CDN mirror. This takes long.',
          actionLabel: 'Index',
          run: () => this.service.indexChaoticRepo(),
        },
        {
          key: 'derivations',
          label: 'Signal derivations',
          description:
            'Rebuild the soname directory, pluginOf links and broken flags from stored analyses. No re-scan.',
          actionLabel: 'Recompute',
          run: () => this.service.recomputeSignalDerivations(),
          confirmation: {
            header: 'Recompute signal derivations',
            message:
              'Rebuild the signal directory index, every pluginOf derivation and the broken flags from the stored analyses? No archives are scanned again.',
          },
        },
      ],
    },
    {
      label: 'Merge requests',
      spansTwoRows: false,
      operations: [
        {
          key: 'mr-scan',
          label: 'Open merge requests',
          description: 'Check open merge requests with the scan rules, auto-flag labels and VirusTotal.',
          actionLabel: 'Scan',
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

    this.confirmationService.confirm({
      header: operation.confirmation.header,
      message: `${operation.confirmation.message} The job runs in the background.`,
      acceptLabel: operation.actionLabel,
      rejectLabel: 'Cancel',
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
