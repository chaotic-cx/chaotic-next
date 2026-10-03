import { DOCUMENT, inject } from '@angular/core';

export type LazyStylesheet = 'maplibre' | 'xterm';

/**
 * Library stylesheets that only some routes need are built as separate,
 * non-injected bundles (see `styles` in project.json). Call this from the
 * consuming component's injection context to attach the bundle once.
 */
export function injectLazyStylesheet(name: LazyStylesheet): void {
  const document = inject(DOCUMENT);
  const id = `lazy-stylesheet-${name}`;
  if (document.getElementById(id)) return;

  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `${name}.css`;
  document.head.appendChild(link);
}
