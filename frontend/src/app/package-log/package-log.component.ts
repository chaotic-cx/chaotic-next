import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  OnDestroy,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { IconField } from '@openng/optimus-ui/iconfield';
import { InputIcon } from '@openng/optimus-ui/inputicon';
import { InputText } from '@openng/optimus-ui/inputtext';
import { AppService } from '../app.service';
import { BuildStatusService } from '../build-status/build-status.service';
import { copyLineLink, formatDuration, parseLogChunk } from '../functions';
import { TitleComponent } from '../title/title.component';
import { XtermLogComponent } from '../xterm-log/xterm-log.component';
import {
  BuildEndReason,
  BuildLogMarkers,
  elapsedSecondsBetween,
  findBuildLogMarkers,
  SCAN_BUFFER_LENGTH,
} from './build-log-markers';
import { PackageLogService } from './package-log.service';

@Component({
  selector: 'chaotic-package-log',
  imports: [XtermLogComponent, TitleComponent, IconField, InputIcon, InputText],
  templateUrl: './package-log.component.html',
  styleUrl: './package-log.component.css',
  host: {
    '(document:keydown)': 'onGlobalKeydown($event)',
  },
})
export class PackageLogComponent implements OnDestroy {
  private readonly appService = inject(AppService);
  private readonly buildStatusService = inject(BuildStatusService);
  private readonly logService = inject(PackageLogService);
  private readonly meta = inject(Meta);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly pkgname = input<string>();
  readonly timestamp = input<string>();

  protected readonly scrollToLine = signal<number | undefined>(undefined);
  protected readonly logChunks = signal<string[]>([]);
  protected readonly streaming = signal(false);
  protected readonly error = signal<string | undefined>(undefined);

  protected readonly builder = signal<string | undefined>(undefined);
  protected readonly searchQuery = signal('');
  protected readonly elapsed = signal(0);

  protected readonly buildStartMs = signal<number | undefined>(undefined);
  protected readonly buildEndMs = signal<number | undefined>(undefined);
  protected readonly endReason = signal<BuildEndReason | undefined>(undefined);

  /** Build duration, shown only while running or when the build finished (success).
   * Failed/canceled/timed-out builds log no finish timestamp, so their elapsed is
   * not derivable and is hidden rather than shown as a misleading value. */
  protected readonly elapsedLabel = computed(() => {
    const reason = this.endReason();
    if (reason !== undefined && reason !== 'success') return undefined;
    return formatDuration(this.elapsed());
  });

  protected readonly subtitle = computed(() => {
    if (!this.pkgname()) return 'Build log';
    const parts = [this.formattedTimestamp()];
    const elapsed = this.elapsedLabel();
    if (elapsed) parts.push(elapsed);
    const remaining = this.remainingLabel();
    if (remaining) parts.push(remaining);
    return parts.join(' · ');
  });

  /** Estimated time remaining, from the live build queue, when the log is streaming. */
  protected readonly remainingLabel = computed(() =>
    this.streaming() ? this.buildStatusService.activeEtaLabels().get(this.pkgname() ?? '') : undefined,
  );

  protected readonly formattedTimestamp = computed(() => {
    const ms = Number(this.timestamp());
    return Number.isFinite(ms) && ms > 0 ? new Date(ms).toLocaleString('en-GB') : (this.timestamp() ?? '');
  });

  private readonly terminalRef = viewChild<XtermLogComponent>('term');
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  /** Character count already received, used to resume a dropped stream. */
  private static readonly RECONNECT_DELAY_MS = 1000;
  private static readonly MAX_RECONNECT_ATTEMPTS = 5;

  private eventSource: EventSource | undefined;
  private elapsedTimer: number | undefined;
  private reconnectTimer: number | undefined;
  private isCompleted = false;
  private reconnectAttempts = 0;
  private cumulativeOffset = 0;
  /** Rolling tail of the log used to find markers without re-scanning the whole log. */
  private scanBuffer = '';
  private readonly onVisibilityChange = (): void => {
    // Backgrounded tabs get their SSE throttled and dropped by the browser.
    // When the tab regains focus and the stream is not yet complete, resume it.
    if (document.visibilityState === 'visible' && !this.isCompleted) {
      if (!this.eventSource || this.eventSource.readyState === EventSource.CLOSED) {
        this.error.set(undefined);
        this.reconnectAttempts = 0;
        this.reconnect();
      }
    }
  };

  constructor() {
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    effect(() => {
      const pkgname = this.pkgname();
      const timestamp = this.timestamp();
      // untracked: loadLog writes many component signals; keeping this effect
      // dependent only on the route inputs prevents any of those from retriggering
      // a reload (and reopening the EventSource).
      if (pkgname && timestamp) untracked(() => this.loadLog(pkgname));
    });
  }

  protected onGlobalKeydown(event: KeyboardEvent): void {
    if (!event.ctrlKey) return;
    const key = event.key.toLowerCase();
    if (key === 'f') {
      event.preventDefault();
      this.searchInput()?.nativeElement.focus();
      this.searchInput()?.nativeElement.select();
    } else if (key === 's') {
      event.preventDefault();
      this.downloadLog();
    }
  }

  ngOnDestroy(): void {
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.stopElapsedTimer();
    this.closeStream();
  }

  private loadLog(pkgname: string): void {
    this.closeStream();
    this.startElapsedTimer();
    this.scanBuffer = '';
    this.logChunks.set([]);
    this.builder.set(undefined);
    this.error.set(undefined);
    this.streaming.set(false);
    this.isCompleted = false;
    this.endReason.set(undefined);
    this.scrollToLine.set(this.requestedLine());
    this.cumulativeOffset = 0;
    this.reconnectAttempts = 0;

    this.appService.updateSeoTags(this.meta, {
      title: `${pkgname} build log`,
      description: 'Build log of a Chaotic-AUR package',
      keywords: 'Chaotic-AUR, build, log, package',
      url: this.router.url,
    });

    this.openStream();
  }

  private openStream(): void {
    const pkgname = this.pkgname();
    const timestamp = this.timestamp();
    if (!pkgname || !timestamp) return;
    // Guard against duplicate connections when re-opening while a stream is
    // still open (e.g. reconnecting on tab focus before the old one errors).
    this.eventSource?.close();
    this.eventSource = undefined;
    const source = new EventSource(this.logService.getLogUrl(pkgname, timestamp, this.cumulativeOffset));
    this.eventSource = source;

    source.onmessage = (event) => {
      const chunk = parseLogChunk(event.data);
      if (!chunk) return;
      if (chunk.complete) {
        this.isCompleted = true;
        this.streaming.set(false);
        this.stopElapsedTimer();
        this.closeStream();
        return;
      }
      this.reconnectAttempts = 0;
      this.streaming.set(true);
      if (chunk.text) {
        this.cumulativeOffset = chunk.offset;
        this.logChunks.update((chunks) => [...chunks, chunk.text]);
        this.scanBuffer += chunk.text;
        // Scan before trimming: markers sit near the top of the log and must be
        // seen before the buffer is cut down to its tail.
        this.scanMarkers();
        if (this.scanBuffer.length > SCAN_BUFFER_LENGTH) {
          this.scanBuffer = this.scanBuffer.slice(-SCAN_BUFFER_LENGTH);
        }
      }
    };

    source.onerror = () => {
      // Do not treat a transient drop as fatal: the browser throttles SSE in
      // backgrounded tabs. Reconnect (resuming from the last offset) instead of
      // permanently closing, and only surface an error once retries are spent.
      this.streaming.set(false);
      if (this.reconnectAttempts >= PackageLogComponent.MAX_RECONNECT_ATTEMPTS) {
        this.error.set('Log stream ended unexpectedly. Please retry in a moment.');
        this.closeStream();
        return;
      }
      this.reconnectAttempts += 1;
      this.closeStream();
      this.scheduleReconnect();
    };
  }

  /** Re-opens the stream from the last received offset, immediately. */
  private reconnect(): void {
    if (this.reconnectTimer !== undefined) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.openStream();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== undefined) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = undefined;
      this.openStream();
    }, PackageLogComponent.RECONNECT_DELAY_MS);
  }

  /** Finds builder/start/end markers in the recent log tail. Runs per chunk on a
   * small rolling buffer, so a long log is never re-scanned in full. */
  private scanMarkers(): void {
    const prior: BuildLogMarkers = {
      builder: this.builder(),
      buildStartMs: this.buildStartMs(),
      buildEndMs: this.buildEndMs(),
    };
    const markers = findBuildLogMarkers(this.scanBuffer, prior);

    if (markers.builder !== undefined && prior.builder === undefined) {
      this.builder.set(markers.builder);
    }
    if (markers.buildStartMs !== undefined && prior.buildStartMs === undefined) {
      this.buildStartMs.set(markers.buildStartMs);
    }
    if (prior.endReason === undefined && markers.endReason !== undefined) {
      // A successful build embeds a UTC finish timestamp, so its duration is
      // exact. Failed/canceled/timed-out builds log no finish time, so the
      // elapsed is hidden rather than shown as a misleading value.
      this.endReason.set(markers.endReason);
      this.stopElapsedTimer();
      const endMs = markers.buildEndMs;
      if (endMs !== undefined) {
        this.buildEndMs.set(endMs);
        const start = this.buildStartMs();
        if (start !== undefined) this.elapsed.set(elapsedSecondsBetween(start, endMs));
      }
    }
  }

  private closeStream(): void {
    if (this.reconnectTimer !== undefined) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.eventSource?.close();
    this.eventSource = undefined;
  }

  private startElapsedTimer(): void {
    // buildStartMs is set by scanMarkers() once the build actually starts
    // executing; until then elapsed stays 0 (queue waiting is not shown).
    this.buildStartMs.set(undefined);
    this.buildEndMs.set(undefined);
    const tick = () => {
      const start = this.buildStartMs();
      if (start === undefined) return;
      const end = this.buildEndMs();
      if (end !== undefined) {
        this.elapsed.set(elapsedSecondsBetween(start, end));
        this.stopElapsedTimer();
        return;
      }
      this.elapsed.set(elapsedSecondsBetween(start, Date.now()));
    };
    if (this.elapsedTimer !== undefined) window.clearInterval(this.elapsedTimer);
    tick();
    this.elapsedTimer = window.setInterval(tick, 1000);
  }

  private stopElapsedTimer(): void {
    if (this.elapsedTimer === undefined) return;
    window.clearInterval(this.elapsedTimer);
    this.elapsedTimer = undefined;
  }

  private requestedLine(): number | undefined {
    const raw = this.route.snapshot.queryParamMap.get('line');
    if (raw === null) return undefined;
    const line = Number(raw);
    return Number.isInteger(line) && line > 0 ? line : undefined;
  }

  protected onSearch(query: string): void {
    this.searchQuery.set(query);
    if (query) this.terminalRef()?.findNext(query);
  }

  protected searchNext(): void {
    this.terminalRef()?.findNext(this.searchQuery());
  }

  protected searchPrevious(): void {
    this.terminalRef()?.findPrevious(this.searchQuery());
  }

  protected downloadLog(): void {
    this.terminalRef()?.downloadLog(`${this.pkgname() ?? 'build'}.log`);
  }

  protected onLineClick(line: number): void {
    copyLineLink(line);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { line },
      queryParamsHandling: 'merge',
      info: { disableViewTransition: true },
    });
  }
}
