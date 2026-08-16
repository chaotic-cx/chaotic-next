import { Directive, EmbeddedViewRef, inject, OnDestroy, OnInit, TemplateRef, ViewContainerRef } from '@angular/core';

/** Look-ahead and look-behind margin around the viewport within which content stays mounted. */
const ROOT_MARGIN = '1500px 0px 1500px 0px';
/** Reserved height until the real height is known, so the spacer reliably triggers the observer. */
const INITIAL_PLACEHOLDER_HEIGHT = '12rem';

/**
 * Mounts its template content only while it is near the viewport and destroys it
 * again once it moves out of the margin, keeping the occupied height via a spacer.
 * Unlike @defer, which only delays creation, this caps the number of live DOM
 * nodes and component instances on very long pages; the spacer keeps the last
 * measured height so scrolling stays stable while content detaches.
 */
@Directive({ selector: '[chaoticLazyViewport]' })
export class LazyViewportDirective implements OnInit, OnDestroy {
  private readonly templateRef = inject(TemplateRef<unknown>);
  private readonly viewContainer = inject(ViewContainerRef);

  private view: EmbeddedViewRef<unknown> | null = null;
  private container: HTMLDivElement | null = null;
  private observer: IntersectionObserver | null = null;

  ngOnInit(): void {
    if (typeof IntersectionObserver === 'undefined') return;

    const anchor = this.viewContainer.element.nativeElement as Comment;
    const parent = anchor.parentElement;
    if (parent === null) return;

    const container = document.createElement('div');
    container.classList.add('chaotic-lazy-viewport');
    container.style.minHeight = INITIAL_PLACEHOLDER_HEIGHT;
    parent.insertBefore(container, anchor);
    this.container = container;

    this.observer = new IntersectionObserver((entries) => this.setVisible(entries[0]?.isIntersecting ?? false), {
      rootMargin: ROOT_MARGIN,
    });
    this.observer.observe(container);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.view?.destroy();
    this.container?.remove();
  }

  private setVisible(visible: boolean): void {
    const container = this.container;
    if (container === null) return;

    if (visible && this.view === null) {
      this.view = this.viewContainer.createEmbeddedView(this.templateRef);
      for (const node of this.view.rootNodes) {
        container.appendChild(node);
      }
      container.style.minHeight = '0px';
      container.style.height = '';
    } else if (!visible && this.view !== null) {
      const height = container.offsetHeight;
      this.view.destroy();
      this.view = null;
      container.style.height = `${height}px`;
    }
  }
}
