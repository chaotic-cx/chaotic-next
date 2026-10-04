import {
  afterNextRender,
  booleanAttribute,
  DestroyRef,
  Directive,
  DOCUMENT,
  ElementRef,
  inject,
  input,
} from '@angular/core';

// Measures the element's top edge into `--chaotic-fill-top`; `.chaotic-fill-viewport` turns it into a height.
// Banners above move that edge and resize the body, so the body is observed.
@Directive({
  selector: '[chaoticFillViewport]',
  host: {
    '[class.chaotic-fill-viewport]': 'chaoticFillViewport()',
  },
})
export class FillViewportDirective {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  readonly chaoticFillViewport = input(true, { transform: booleanAttribute });

  constructor() {
    afterNextRender(() => {
      const observer = new ResizeObserver(() => this.measureTop());
      observer.observe(this.document.body);
      this.destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  private measureTop(): void {
    if (!this.chaoticFillViewport()) return;

    const top = Math.round(this.element.getBoundingClientRect().top + window.scrollY);
    this.element.style.setProperty('--chaotic-fill-top', `${top}px`);
  }
}
