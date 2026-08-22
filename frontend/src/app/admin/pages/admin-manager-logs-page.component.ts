import { AfterViewInit, Component, ElementRef, inject, OnDestroy, signal, viewChild } from '@angular/core';
import { ProgressSpinner } from '@openng/optimus-ui/progressspinner';
import { APP_CONFIG } from '../../../environments/app-config.token';
import { ResilientSseStream } from '../../sse-stream';
import { XtermLogComponent } from '../../xterm-log/xterm-log.component';

const ESC = String.fromCharCode(27);
const TIMESTAMP_RE = new RegExp(`^${ESC}\\[2m\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z${ESC}\\[0m `);

@Component({
  selector: 'chaotic-admin-manager-logs-page',
  imports: [ProgressSpinner, XtermLogComponent],
  template: `
    @if (streaming()) {
      <span class="mb-2 flex items-center gap-1.5 text-sm text-ctp-green">
        <span class="inline-block ml-2 h-2 w-2 rounded-full bg-ctp-green"></span>
        Connected
      </span>
    }

    @if (error()) {
      <p class="mb-2 text-ctp-red text-sm">{{ error() }}</p>
    }

    @if (streaming() || logChunks().length > 0) {
      <div class="log-panel-wrap" [style.height.px]="logHeight()">
        <chaotic-xterm-log [chunk]="logChunks()" [clearSignal]="clearSignal()" />
      </div>
    } @else if (loading()) {
      <div class="flex min-h-[20rem] flex-col items-center justify-center gap-2 py-10 text-center text-ctp-subtext0">
        <p-progress-spinner ariaLabel="Connecting to manager logs" />
      </div>
    }
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
    `,
  ],
})
export class AdminManagerLogsPageComponent implements AfterViewInit, OnDestroy {
  private readonly backendUrl = inject(APP_CONFIG).backendUrl;
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
        this.error.set('Log stream ended unexpectedly. Reload the page to retry.');
      },
    });
    this.stream.open();
  }
}
