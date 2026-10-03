import { AfterViewInit, Component, ElementRef, inject, OnDestroy, signal, viewChild } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { ProgressSpinner } from '@openng/optimus-ui/progressspinner';
import { APP_CONFIG } from '../../../environments/app-config.token';
import { ResilientSseStream } from '../../sse-stream';
import { XtermLogComponent } from '../../xterm-log/xterm-log.component';

const ESC = String.fromCharCode(27);
const TIMESTAMP_RE = new RegExp(`^${ESC}\\[2m\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z${ESC}\\[0m `);

@Component({
  selector: 'chaotic-admin-manager-logs-page',
  imports: [ProgressSpinner, TranslocoDirective, XtermLogComponent],
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

      @if (error()) {
        <p class="mb-2 text-sm text-ctp-red">{{ error() }}</p>
      }

      @if (streaming() || logChunks().length > 0) {
        <div class="log-panel-wrap" [style.height.px]="logHeight()">
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

      .log-status {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.5rem;
        font-size: 0.8125rem;
        color: var(--ctp-mocha-overlay1);
      }

      .log-status__dot {
        width: 0.5rem;
        height: 0.5rem;
        border-radius: 9999px;
        background: var(--ctp-mocha-overlay0);
      }

      .log-status.is-live {
        color: var(--ctp-mocha-green);
      }

      .log-status.is-live .log-status__dot {
        background: var(--ctp-mocha-green);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--ctp-mocha-green) 20%, transparent);
      }
    `,
  ],
})
export class AdminManagerLogsPageComponent implements AfterViewInit, OnDestroy {
  private readonly backendUrl = inject(APP_CONFIG).backendUrl;
  private readonly transloco = inject(TranslocoService);
  private readonly host = viewChild<ElementRef<HTMLElement>>('host');

  readonly logChunks = signal<string[]>([]);
  readonly clearSignal = signal(false);
  readonly streaming = signal(false);
  readonly loading = signal(true);
  readonly error = signal<string | undefined>(undefined);
  readonly logHeight = signal(600);

  private stream: ResilientSseStream | undefined;
  private resizeObserver: ResizeObserver | undefined;
  private readonly isMobile = window.matchMedia('(pointer: coarse)').matches;

  constructor() {
    this.connect();
  }

  ngAfterViewInit(): void {
    this.resizeObserver = new ResizeObserver(() => this.updateHeight());
    this.resizeObserver.observe(document.documentElement);
    this.updateHeight();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.stream?.close();
  }

  private updateHeight(): void {
    const viewportHeight = window.innerHeight;
    const offset = 350;
    this.logHeight.set(Math.max(viewportHeight - offset, 400));
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
