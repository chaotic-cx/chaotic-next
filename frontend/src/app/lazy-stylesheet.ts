import { DOCUMENT, inject } from '@angular/core';

export type LazyStylesheet = 'maplibre' | 'xterm';

const loadedStylesheets = new Map<LazyStylesheet, Promise<void>>();

/**
 * Library stylesheets that only some routes need are built as separate,
 * non-injected bundles (see `styles` in project.json). Call this from the
 * consuming component's injection context to attach the bundle once.
 * The promise resolves when the stylesheet applies, also when it fails to load.
 */
export function injectLazyStylesheet(name: LazyStylesheet): Promise<void> {
  const document = inject(DOCUMENT);
  const pending = loadedStylesheets.get(name);
  if (pending) return pending;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `${name}.css`;

  const loaded = new Promise<void>((resolve) => {
    link.addEventListener('load', () => resolve(), { once: true });
    link.addEventListener('error', () => resolve(), { once: true });
  });
  loadedStylesheets.set(name, loaded);
  document.head.appendChild(link);

  return loaded;
}
