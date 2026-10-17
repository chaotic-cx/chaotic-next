import { Component, DestroyRef, inject, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { injectIsBrowser } from '../platform';

/**
 * App-wide notice while the browser reports that it has no network connection.
 */
@Component({
  selector: 'chaotic-connection-banner',
  imports: [TranslocoDirective],
  template: `
    <div *transloco="let t" role="status">
      @if (offline()) {
        <p class="chaotic-connection-banner">
          <i class="pi pi-wifi" aria-hidden="true"></i>
          {{ t('uiStates.offline') }}
        </p>
      }
    </div>
  `,
})
export class ConnectionBannerComponent {
  private readonly isBrowser = injectIsBrowser();

  protected readonly offline = signal(this.isBrowser && !navigator.onLine);

  constructor() {
    if (!this.isBrowser) return;

    const update = (): void => this.offline.set(!navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);

    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    });
  }
}
