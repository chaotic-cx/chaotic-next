import { Directive, ElementRef, inject, OnDestroy } from '@angular/core';

const FLIP_DURATION_MS = 450;

interface Position {
  top: number;
  left: number;
}

@Directive({ selector: '[chaoticFlipList]' })
export class FlipListDirective implements OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly positions = new Map<Element, Position>();
  private observer: MutationObserver | undefined;
  private flipScheduled = false;

  constructor() {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // offsetTop/offsetLeft ignore transforms, so positions captured mid-enter
    // animation still describe the final layout slot.
    this.capture();
    this.observer = new MutationObserver(() => this.onMutations());
    this.observer.observe(this.host, { childList: true });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  private onMutations(): void {
    if (this.flipScheduled) return;
    this.flipScheduled = true;
    requestAnimationFrame(() => {
      this.flipScheduled = false;
      this.applyFlip();
    });
  }

  private applyFlip(): void {
    const previous = new Map(this.positions);
    this.capture();

    for (const [child, current] of this.positions) {
      const before = previous.get(child);
      if (!before) continue;

      const deltaX = before.left - current.left;
      const deltaY = before.top - current.top;
      if (deltaX === 0 && deltaY === 0) continue;

      // Rapid successive updates would stack competing animations.
      for (const animation of child.getAnimations()) animation.cancel();
      child.animate([{ transform: `translate(${deltaX}px, ${deltaY}px)` }, { transform: 'translate(0, 0)' }], {
        duration: FLIP_DURATION_MS,
        easing: 'ease-out',
      });
    }
  }

  private capture(): void {
    this.positions.clear();
    for (const child of Array.from(this.host.children)) {
      if (!(child instanceof HTMLElement)) continue;
      this.positions.set(child, { top: child.offsetTop, left: child.offsetLeft });
    }
  }
}
