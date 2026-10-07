import { afterNextRender, DestroyRef, Directive, ElementRef, inject } from '@angular/core';

// The PrimeNG menubar marks the link of the current route with this class only.
const ACTIVE_LINK_CLASS = 'p-menubar-item-link-active';
const MENUBAR_LINK_SELECTOR = 'a.p-menubar-item-link';

/**
 * Gives the active menubar link `aria-current="page"`, so screen readers announce the current page.
 * The menubar has no option for this. The directive follows the active class that the router sets.
 */
@Directive({
  selector: '[chaoticNavActiveCurrent]',
})
export class NavActiveCurrentDirective {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => this.observeActiveLinks());
  }

  private observeActiveLinks(): void {
    this.syncAriaCurrent();

    const observer = new MutationObserver(() => this.syncAriaCurrent());
    observer.observe(this.host, { subtree: true, childList: true, attributeFilter: ['class'] });
    this.destroyRef.onDestroy(() => observer.disconnect());
  }

  private syncAriaCurrent(): void {
    for (const link of this.host.querySelectorAll<HTMLAnchorElement>(MENUBAR_LINK_SELECTOR)) {
      const isActive = link.classList.contains(ACTIVE_LINK_CLASS);
      const hasAriaCurrent = link.getAttribute('aria-current') === 'page';

      // Only changed attributes are written, so the observer does not trigger itself again.
      if (isActive && !hasAriaCurrent) {
        link.setAttribute('aria-current', 'page');
      } else if (!isActive && link.hasAttribute('aria-current')) {
        link.removeAttribute('aria-current');
      }
    }
  }
}
