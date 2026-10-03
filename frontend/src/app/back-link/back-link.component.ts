import { Location } from '@angular/common';
import { Component, inject, input, untracked } from '@angular/core';
import { Router } from '@angular/router';

/**
 * Link back to the list that a detail page came from.
 * After an in-app navigation it goes back in the history, so the list keeps its filters and page.
 * After a direct visit (shared link, reload) it opens `fallback` instead.
 */
@Component({
  selector: 'chaotic-back-link',
  template: `
    <a class="back-link" [attr.href]="fallback()" (click)="goBack($event)">
      <i class="pi pi-arrow-left" aria-hidden="true"></i>
      {{ label() }}
    </a>
  `,
  styles: `
    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      min-height: 2.25rem;
      font-size: 0.8125rem;
      color: var(--chaotic-fg-muted);
      transition: color var(--chaotic-duration-fast) var(--chaotic-ease-out);
    }

    .back-link:hover,
    .back-link:focus-visible {
      color: var(--catppuccin-color-mauve);
    }

    .back-link i {
      font-size: 0.75rem;
    }
  `,
})
export class BackLinkComponent {
  private readonly location = inject(Location);
  private readonly router = inject(Router);

  readonly fallback = input.required<string>();
  readonly label = input.required<string>();

  // The router creates this component before it records the current navigation,
  // so a value here means that an earlier page of this app exists in the history.
  private readonly cameFromApp = untracked(this.router.lastSuccessfulNavigation) !== null;

  protected goBack(event: MouseEvent): void {
    if (isModifiedClick(event)) {
      return;
    }

    event.preventDefault();
    if (this.cameFromApp) {
      this.location.back();
    } else {
      void this.router.navigateByUrl(this.fallback());
    }
  }
}

// A modified click opens the link in a new tab or window, so it must keep the link target.
function isModifiedClick(event: MouseEvent): boolean {
  return event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0;
}
