import { Component, DestroyRef, inject, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

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
  protected readonly offline = signal(!navigator.onLine);

  constructor() {
    const update = (): void => this.offline.set(!navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);

    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    });
  }
}
