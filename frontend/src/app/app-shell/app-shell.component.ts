import { Component } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

/**
 * Prerendered into index.csr.html, the page that every client-rendered route gets first.
 * It shows the site frame with a generic page skeleton until the routed page replaces it.
 */
@Component({
  selector: 'chaotic-app-shell',
  imports: [TranslocoDirective],
  template: `
    <div class="chaotic-page" *transloco="let t">
      <span class="sr-only" role="status">{{ t('common.loading') }}</span>
      <div class="app-shell__header" aria-hidden="true">
        <div class="app-shell__title chaotic-skeleton"></div>
        <div class="app-shell__subtitle chaotic-skeleton"></div>
      </div>
      <div class="app-shell__content chaotic-skeleton" aria-hidden="true"></div>
    </div>
  `,
  styles: `
    .app-shell__header {
      display: flex;
      flex-direction: column;
      gap: var(--chaotic-space-sm);
      margin-block: var(--chaotic-space-sm) var(--chaotic-space-xl);
      padding-inline: var(--chaotic-inset);
    }

    .app-shell__title {
      width: min(18rem, 60%);
      height: 1.75rem;
    }

    .app-shell__subtitle {
      width: min(32rem, 85%);
      height: 1rem;
    }

    .app-shell__content {
      height: 28rem;
      border-radius: var(--chaotic-radius-lg);
    }
  `,
})
export class AppShellComponent {}
