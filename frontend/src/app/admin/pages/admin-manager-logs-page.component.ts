import { Component, inject, OnDestroy, signal } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { ProgressSpinner } from '@openng/optimus-ui/progressspinner';
import { APP_CONFIG } from '../../../environments/app-config.token';
import { LoadErrorComponent } from '../../load-error/load-error.component';
import { ResilientSseStream } from '../../sse-stream';
import { XtermLogComponent } from '../../xterm-log/xterm-log.component';

const ESC = String.fromCharCode(27);
const TIMESTAMP_RE = new RegExp(`^${ESC}\\[2m\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z${ESC}\\[0m `);

@Component({
  selector: 'chaotic-admin-manager-logs-page',
  imports: [LoadErrorComponent, ProgressSpinner, TranslocoDirective, XtermLogComponent],
  template: `
    <ng-container *transloco="let t; prefix: 'admin.managerLogs'">
      <p class="log-status" [class.is-live]="streaming()" role="status">
        <span class="log-status__dot" aria-hidden="true"></span>
        @if (streaming()) {
          {{ t('status.connected') }}
        } @else if (loading()) {
          {{ t('status.connecting') }}
        } @else {
          {{ t('status.disconnected') }}
        }
      </p>

      @if (error(); as message) {
        <chaotic-load-error class="mb-2" [message]="message" (retry)="reconnect()" />
      }

      @if (streaming() || logChunks().length > 0) {
        <div class="log-panel-wrap log-panel-wrap--viewport">
          <chaotic-xterm-log [chunk]="logChunks()" [clearSignal]="clearSignal()" />
        </div>
      } @else if (loading()) {
        <div class="log-panel-wrap items-center justify-center">
          <p-progress-spinner [ariaLabel]="t('connectingAriaLabel')" />
        </div>
      }
    </ng-container>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
      }

      .log-panel-wrap {
        display: flex;
        flex-direction: column;
        min-height: 20rem;
      }

      .log-panel-wrap--viewport {
        --log-panel-viewport-offset: 21.875rem;
        --log-panel-min-height: 25rem;

        height: max(calc(100dvh - var(--log-panel-viewport-offset)), var(--log-panel-min-height));
      }

      .log-status {
        display: inline-flex;
        align-items: center;
        gap: var(--chaotic-space-sm);
        margin-bottom: var(--chaotic-space-sm);
        font-size: var(--chaotic-text-sm);
        color: var(--chaotic-fg-faint);
      }

      .log-status__dot {
        width: 0.5rem;
        height: 0.5rem;
        border-radius: var(--chaotic-radius-pill);
        background: var(--catppuccin-color-overlay0);
      }

      .log-status.is-live {
        color: var(--chaotic-ink-green);
      }

      .log-status.is-live .log-status__dot {
        background: var(--catppuccin-color-green);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--catppuccin-color-green) 20%, transparent);
      }
    `,
  ],
})
export class AdminManagerLogsPageComponent implements OnDestroy {
  private readonly backendUrl = inject(APP_CONFIG).backendUrl;
  private readonly transloco = inject(TranslocoService);

  readonly logChunks = signal<string[]>([]);
  readonly clearSignal = signal(false);
  readonly streaming = signal(false);
  readonly loading = signal(true);
  readonly error = signal<string | undefined>(undefined);

  private stream: ResilientSseStream | undefined;
  private readonly isMobile = window.matchMedia('(pointer: coarse)').matches;

  constructor() {
    this.connect();
  }

  ngOnDestroy(): void {
    this.stream?.close();
  }

  protected reconnect(): void {
    this.loading.set(true);
    this.connect();
  }

  private connect(): void {
    this.error.set(undefined);

    this.stream?.close();
    this.stream = new ResilientSseStream({
      url: () => `${this.backendUrl}/api/manager/logs?ngsw-bypass`,
      onOpen: () => {
        this.loading.set(false);
        this.streaming.set(true);
      },
      onMessage: (data) => {
        const line = this.isMobile ? data.replace(TIMESTAMP_RE, '') : data;
        if (line) {
          this.logChunks.update((chunks) => [...chunks, line]);
        }
      },
      onErrorExhausted: () => {
        this.loading.set(false);
        this.streaming.set(false);
        this.error.set(this.transloco.translate('admin.managerLogs.streamEnded'));
      },
    });
    this.stream.open();
  }
}
