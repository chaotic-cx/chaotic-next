import { DestroyRef, inject, signal, type Signal } from '@angular/core';

/**
 * A skeleton stays invisible this long, so a fast response never flashes it.
 * Keep it equal to --chaotic-skeleton-delay in styles.css.
 */
export const SKELETON_REVEAL_DELAY_MS = 200;

// Past this time, a skeleton tells the user that the request is still running.
export const SLOW_LOADING_AFTER_MS = 5000;

/**
 * True once the calling skeleton is visible for longer than SLOW_LOADING_AFTER_MS.
 * Must run in an injection context.
 */
export function injectSlowLoading(): Signal<boolean> {
  const slow = signal(false);
  const timer = setTimeout(() => slow.set(true), SLOW_LOADING_AFTER_MS);
  inject(DestroyRef).onDestroy(() => clearTimeout(timer));

  return slow.asReadonly();
}
