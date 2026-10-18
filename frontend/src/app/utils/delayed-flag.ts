import { effect, signal, type Signal } from '@angular/core';

/**
 * True only after `source` stayed true for `delayMs`. False again as soon as `source` is false.
 * Use it for a state that comes and goes inside one component. A skeleton that a template
 * creates and destroys can use the `skeleton-reveal` class instead.
 * Must run in an injection context.
 */
export function delayedFlag(source: Signal<boolean>, delayMs: number): Signal<boolean> {
  const delayed = signal(false);

  effect((onCleanup) => {
    if (!source()) {
      delayed.set(false);
      return;
    }

    const timer = window.setTimeout(() => delayed.set(true), delayMs);
    onCleanup(() => window.clearTimeout(timer));
  });

  return delayed.asReadonly();
}
