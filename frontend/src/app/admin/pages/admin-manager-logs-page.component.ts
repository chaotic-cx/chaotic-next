import { AfterViewInit, Component, ElementRef, inject, OnDestroy, signal, viewChild } from '@angular/core';
import { ProgressSpinner } from '@openng/optimus-ui/progressspinner';
import { APP_CONFIG } from '../../../environments/app-config.token';
import { XtermLogComponent } from '../../xterm-log/xterm-log.component';

const RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_ATTEMPTS = 5;
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

  private eventSource: EventSource | undefined;
  private reconnectTimer: number | undefined;
  private reconnectAttempts = 0;
  private resizeObserver: ResizeObserver | undefined;
  private readonly isMobile = window.matchMedia('(pointer: coarse)').matches;

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible' && !this.eventSource && !this.error()) {
      this.reconnectAttempts = 0;
      this.connect();
    }
  };

  constructor() {
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.connect();
  }

  ngAfterViewInit(): void {
    this.resizeObserver = new ResizeObserver(() => this.updateHeight());
    this.resizeObserver.observe(document.documentElement);
    this.updateHeight();
  }

  ngOnDestroy(): void {
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.resizeObserver?.disconnect();
    this.closeStream();
  }

  private updateHeight(): void {
    const viewportHeight = window.innerHeight;
    const offset = 350;
    this.logHeight.set(Math.max(viewportHeight - offset, 400));
  }

  private connect(): void {
    this.closeStream();
    this.error.set(undefined);

    const source = new EventSource(`${this.backendUrl}/api/manager/logs`);
    this.eventSource = source;

    source.onopen = () => {
      this.loading.set(false);
      this.streaming.set(true);
      this.reconnectAttempts = 0;
    };

    source.onmessage = (event) => {
      let data = event.data as string;
      if (data && this.isMobile) data = data.replace(TIMESTAMP_RE, '');
      if (data) {
        this.logChunks.update((chunks) => [...chunks, data]);
      }
    };

    source.onerror = () => {
      this.streaming.set(false);
      this.closeStream();

      if (document.visibilityState !== 'visible') return;

      if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        this.loading.set(false);
        this.error.set('Log stream ended unexpectedly. Reload the page to retry.');
        return;
      }

      this.reconnectAttempts += 1;
      this.reconnectTimer = window.setTimeout(() => {
        this.reconnectTimer = undefined;
        this.connect();
      }, RECONNECT_DELAY_MS);
    };
  }

  private closeStream(): void {
    if (this.reconnectTimer !== undefined) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    this.eventSource?.close();
    this.eventSource = undefined;
  }
}
