import { ViewportScroller } from '@angular/common';
import { inject, provideAppInitializer } from '@angular/core';

const SHELL_BAR_SELECTOR = '.garuda-shell-menubar';
const ANCHOR_GAP_PX = 16;

// The router anchor scroll ignores scroll-margin-top, so the fixed shell bar would cover the target.
function shellBarOffset(): [number, number] {
  const bar = document.querySelector(SHELL_BAR_SELECTOR);
  if (!bar || getComputedStyle(bar).position !== 'fixed') return [0, 0];

  return [0, bar.getBoundingClientRect().bottom + ANCHOR_GAP_PX];
}

export function provideShellScrollOffset() {
  return provideAppInitializer(() => {
    inject(ViewportScroller).setOffset(shellBarOffset);
  });
}
