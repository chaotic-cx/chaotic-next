import { DOCUMENT } from '@angular/common';
import { afterNextRender, DestroyRef, Directive, ElementRef, inject } from '@angular/core';
import { SHELL_BAR_SELECTOR } from './shell-scroll-offset';

const OFFSET_PROPERTY = '--chaotic-below-shell-bar';

const BAR_GAP_PX = 10;

@Directive({
  selector: '[chaoticShellBarOffset]',
})
export class ShellBarOffsetDirective {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => this.observeBar());
  }

  private observeBar(): void {
    const bar = this.host.querySelector<HTMLElement>(SHELL_BAR_SELECTOR);
    if (!bar) return;

    const observer = new ResizeObserver(() => this.storeOffset(bar));
    observer.observe(bar);
    this.destroyRef.onDestroy(() => observer.disconnect());
  }

  private storeOffset(bar: HTMLElement): void {
    const root = this.document.documentElement;
    if (getComputedStyle(bar).position !== 'fixed') {
      root.style.removeProperty(OFFSET_PROPERTY);
      return;
    }

    const offset = Math.round(bar.getBoundingClientRect().bottom + BAR_GAP_PX);
    root.style.setProperty(OFFSET_PROPERTY, `${offset}px`);
  }
}
