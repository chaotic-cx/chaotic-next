import { Component, effect, inject, input, signal } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { ProgressSpinner } from '@openng/optimus-ui/progressspinner';
import { AppService } from '../app.service';
import { errorMessage } from '../functions';
import { TitleComponent } from '../title/title.component';
import { XtermLogComponent } from '../xterm-log/xterm-log.component';
import { PackageLogService } from './package-log.service';

const NOT_FOUND_STATUS = 404;

@Component({
  selector: 'chaotic-package-log',
  imports: [XtermLogComponent, ProgressSpinner, TitleComponent],
  templateUrl: './package-log.component.html',
  styleUrl: './package-log.component.css',
})
export class PackageLogComponent {
  private readonly appService = inject(AppService);
  private readonly logService = inject(PackageLogService);
  private readonly meta = inject(Meta);
  private readonly router = inject(Router);

  readonly pkgname = input<string>();
  readonly timestamp = input<string>();

  protected readonly logChunk = signal('');
  protected readonly loading = signal(true);
  protected readonly error = signal<string | undefined>(undefined);

  constructor() {
    effect(() => {
      const pkgname = this.pkgname();
      const timestamp = this.timestamp();
      if (pkgname && timestamp) void this.loadLog(pkgname, timestamp);
    });
  }

  private async loadLog(pkgname: string, timestamp: string): Promise<void> {
    this.logChunk.set('');
    this.error.set(undefined);
    this.loading.set(true);

    this.appService.updateSeoTags(this.meta, {
      title: `${pkgname} build log`,
      description: 'Build log of a Chaotic-AUR package',
      keywords: 'Chaotic-AUR, build, log, package',
      url: this.router.url,
    });

    try {
      const url = this.logService.getLogUrl(pkgname, timestamp);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(response.status === NOT_FOUND_STATUS ? 'Build log not found' : 'Could not fetch build log');
      }
      if (!response.body) {
        throw new Error('No log stream body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      this.loading.set(false);

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        if (value) {
          const text = decoder.decode(value, { stream: true });
          this.logChunk.set(text);
        }
      }
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
