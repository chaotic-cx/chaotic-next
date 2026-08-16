import { Component, computed, effect, inject, input, OnDestroy, signal, viewChild } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { GitlabLogChunk } from '@chaotic-next/shared-lib';
import { IconField } from '@openng/optimus-ui/iconfield';
import { InputIcon } from '@openng/optimus-ui/inputicon';
import { InputText } from '@openng/optimus-ui/inputtext';
import { ProgressSpinner } from '@openng/optimus-ui/progressspinner';
import { AppService } from '../app.service';
import { TitleComponent } from '../title/title.component';
import { XtermLogComponent } from '../xterm-log/xterm-log.component';
import { PackageLogService } from './package-log.service';

function parseChunk(data: string): GitlabLogChunk | undefined {
  try {
    const value: unknown = JSON.parse(data);
    if (typeof value !== 'object' || value === null) return undefined;
    const partial = value as Partial<GitlabLogChunk>;
    if (typeof partial.text !== 'string') return undefined;
    return {
      offset: partial.offset ?? 0,
      text: partial.text,
      complete: partial.complete === true,
      status: partial.status ?? '',
    };
  } catch {
    return undefined;
  }
}

@Component({
  selector: 'chaotic-package-log',
  imports: [XtermLogComponent, ProgressSpinner, TitleComponent, IconField, InputIcon, InputText],
  templateUrl: './package-log.component.html',
  styleUrl: './package-log.component.css',
})
export class PackageLogComponent implements OnDestroy {
  private readonly appService = inject(AppService);
  private readonly logService = inject(PackageLogService);
  private readonly meta = inject(Meta);
  private readonly router = inject(Router);

  readonly pkgname = input<string>();
  readonly timestamp = input<string>();

  protected readonly logChunk = signal('');
  protected readonly loading = signal(true);
  protected readonly streaming = signal(false);
  protected readonly error = signal<string | undefined>(undefined);

  protected readonly builder = signal<string | undefined>(undefined);
  protected readonly searchQuery = signal('');

  protected readonly formattedTimestamp = computed(() => {
    const ms = Number(this.timestamp());
    return Number.isFinite(ms) && ms > 0 ? new Date(ms).toLocaleString('en-GB') : (this.timestamp() ?? '');
  });

  private readonly terminalRef = viewChild<XtermLogComponent>('term');

  private eventSource: EventSource | undefined;

  constructor() {
    effect(() => {
      const pkgname = this.pkgname();
      const timestamp = this.timestamp();
      if (pkgname && timestamp) this.loadLog(pkgname, timestamp);
    });

    effect(() => {
      if (this.builder()) return;
      const match = this.logChunk().match(/Executing build on host ([^\s.,]+)/);
      if (match?.[1]) this.builder.set(match[1]);
    });
  }

  ngOnDestroy(): void {
    this.closeStream();
  }

  private loadLog(pkgname: string, timestamp: string): void {
    this.closeStream();
    this.logChunk.set('');
    this.builder.set(undefined);
    this.error.set(undefined);
    this.loading.set(true);
    this.streaming.set(false);

    this.appService.updateSeoTags(this.meta, {
      title: `${pkgname} build log`,
      description: 'Build log of a Chaotic-AUR package',
      keywords: 'Chaotic-AUR, build, log, package',
      url: this.router.url,
    });

    const source = new EventSource(this.logService.getLogUrl(pkgname, timestamp));
    this.eventSource = source;
    let firstDelivery = true;

    source.onmessage = (event) => {
      const chunk = parseChunk(event.data);
      if (!chunk) return;
      this.loading.set(false);
      if (chunk.complete) {
        this.streaming.set(false);
        this.closeStream();
        return;
      }
      if (chunk.text) {
        if (!firstDelivery) {
          this.streaming.set(true);
        }
        firstDelivery = false;
        this.logChunk.set(this.logChunk() + chunk.text);
      }
    };

    source.onerror = () => {
      this.loading.set(false);
      this.closeStream();
    };
  }

  private closeStream(): void {
    this.eventSource?.close();
    this.eventSource = undefined;
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
}
