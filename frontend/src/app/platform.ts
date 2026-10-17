import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID } from '@angular/core';

/**
 * False while the build prerenders a page. Code that needs browser globals,
 * opens connections or starts timers checks it first.
 * Call it in an injection context.
 */
export function injectIsBrowser(): boolean {
  return isPlatformBrowser(inject(PLATFORM_ID));
}
